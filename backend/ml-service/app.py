"""
CasterlyCare Vitals Drift Service
-----------------------------------

MLOps / Data Observability approach: this service does NOT train a
machine-learning model. Instead it uses Evidently AI directly as a
statistical distance engine, measuring how far a patient's submitted
vitals have drifted from a fixed reference ("baseline") population.

The baseline below is a synthetic/reference distribution intended to
make the development system functional - it is NOT a clinically
validated postoperative dataset. Before real clinical deployment,
replace it with an appropriately governed reference population.

Why Evidently, and why per-submission (not batch):
  Evidently's usual workflow compares two batches of rows. Here each
  API call scores a single new reading, so every column's "current"
  dataset is one row. Evidently's Wasserstein-distance drift test is
  well-defined for a single point (unlike a KS test, which degenerates
  at n=1), so that is the statistical test used for every vital.

Each vital's raw Wasserstein distance is in that vital's own units
(mmHg, bpm, ...), so it is normalized by the baseline's own standard
deviation for that column before averaging across vitals - this turns
"9 mmHg off" and "1.2% off" into comparable "how many baseline
standard deviations away" numbers.
"""

from __future__ import annotations

import os
from typing import List

import numpy as np
import pandas as pd
from evidently import Dataset, Report
from evidently.metrics import ValueDrift
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


APP_NAME = "CasterlyCare Vitals Drift Service"
MODEL_VERSION = "v3-evidently-drift-baseline"
ALGORITHM_NAME = "Evidently AI — Wasserstein distance vs fixed baseline"

HOST = os.getenv("ML_SERVICE_HOST", "127.0.0.1")
PORT = int(os.getenv("ML_SERVICE_PORT", "8000"))

# A drift magnitude of roughly this many averaged baseline-standard-
# deviations maps to score ≈ 0.63 (1 - e^-1); tuned so a clearly
# abnormal reading (several vitals each many SDs off) lands close to
# 1.0, and a reading close to the baseline centres lands close to 0.
DRIFT_SENSITIVITY = 2.0

# score >= this is reported as "outlier", mirroring the previous
# model's inlier/outlier split so downstream code needs no changes.
OUTLIER_THRESHOLD = 0.5

# ---------------------------------------------------------------------
# Fixed baseline (reference) population
# ---------------------------------------------------------------------
#
# These are NOT patient records - a stable reference distribution
# around the monitoring ranges currently used by the application.
#
# Feature order: SpO2, systolic BP, diastolic BP, heart rate, temperature °F
# ---------------------------------------------------------------------

BASELINE_COLUMNS = ["spo2", "systolic", "diastolic", "heartRate", "temperature"]

BASELINE_CENTERS = np.array(
    [
        [98.0, 118.0, 74.0, 72.0, 98.2],
        [97.5, 112.0, 70.0, 68.0, 98.0],
        [98.5, 121.0, 76.0, 76.0, 98.4],
        [97.0, 108.0, 68.0, 65.0, 97.8],
        [99.0, 125.0, 78.0, 80.0, 98.6],
    ],
    dtype=float,
)

BASELINE_SCALE = np.array([1.2, 8.0, 6.0, 7.0, 0.45], dtype=float)


def build_baseline_population(samples_per_center: int = 80) -> pd.DataFrame:
    """Deterministic synthetic/reference "healthy recovery" population."""

    rng = np.random.default_rng(20260904)
    populations: List[np.ndarray] = []

    clip_bounds = [
        (94.0, 100.0),
        (90.0, 130.0),
        (60.0, 85.0),
        (55.0, 100.0),
        (97.0, 99.5),
    ]

    for center in BASELINE_CENTERS:
        samples = rng.normal(loc=center, scale=BASELINE_SCALE, size=(samples_per_center, 5))
        for column_index, (low, high) in enumerate(clip_bounds):
            samples[:, column_index] = np.clip(samples[:, column_index], low, high)
        populations.append(samples)

    return pd.DataFrame(np.vstack(populations), columns=BASELINE_COLUMNS)


baseline_population = build_baseline_population()
baseline_dataset = Dataset.from_pandas(baseline_population)
baseline_std = baseline_population.std(ddof=0)


# ---------------------------------------------------------------------
# API
# ---------------------------------------------------------------------

app = FastAPI(title=APP_NAME, version=MODEL_VERSION)


class VitalsRequest(BaseModel):
    spo2: float = Field(..., ge=0, le=100)
    systolic: float = Field(..., ge=20, le=300)
    diastolic: float = Field(..., ge=10, le=200)
    heartRate: float = Field(..., ge=20, le=250)
    temperature: float = Field(..., ge=85, le=115)


class ScoreResponse(BaseModel):
    modelVersion: str
    score: float
    decisionValue: float
    prediction: int
    label: str
    algorithm: str


def validate_relationships(vitals: VitalsRequest) -> None:
    """Reject obviously malformed vital combinations before scoring."""

    if vitals.diastolic >= vitals.systolic:
        raise HTTPException(
            status_code=400,
            detail="Diastolic pressure must be lower than systolic pressure.",
        )


def compute_drift_magnitude(vitals: VitalsRequest) -> float:
    """
    Mean, per-vital Wasserstein drift distance from the fixed baseline,
    each normalized by that vital's own baseline standard deviation so
    every vital contributes on a comparable "SDs away" scale.
    """

    current = pd.DataFrame([[
        vitals.spo2,
        vitals.systolic,
        vitals.diastolic,
        vitals.heartRate,
        vitals.temperature,
    ]], columns=BASELINE_COLUMNS)

    current_dataset = Dataset.from_pandas(current)

    report = Report([ValueDrift(column=column, method="wasserstein") for column in BASELINE_COLUMNS])
    result = report.run(reference_data=baseline_dataset, current_data=current_dataset)

    normalized_distances = [
        float(metric["value"]) / float(baseline_std[column])
        for metric, column in zip(result.dict()["metrics"], BASELINE_COLUMNS)
    ]

    return float(np.mean(normalized_distances))


def drift_magnitude_to_score(drift_magnitude: float) -> float:
    """Bounded 0..1 score - 0 matches the baseline exactly, 1 is far outside it."""

    score = 1.0 - np.exp(-drift_magnitude / DRIFT_SENSITIVITY)
    return float(np.clip(score, 0.0, 1.0))


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": APP_NAME,
        "modelVersion": MODEL_VERSION,
        "algorithm": ALGORITHM_NAME,
        "baselinePopulation": "synthetic-reference-development-population",
    }


@app.post("/score", response_model=ScoreResponse)
def score_vitals(vitals: VitalsRequest) -> ScoreResponse:
    validate_relationships(vitals)

    drift_magnitude = compute_drift_magnitude(vitals)
    score = drift_magnitude_to_score(drift_magnitude)
    label = "outlier" if score >= OUTLIER_THRESHOLD else "normal"

    return ScoreResponse(
        modelVersion=MODEL_VERSION,
        score=round(score, 6),
        # Kept for API compatibility with the previous model's contract;
        # here it is the raw (unnormalized-to-0..1) drift magnitude, sign-
        # flipped so it stays negative-when-worse like the old decision
        # function did.
        decisionValue=round(-drift_magnitude, 6),
        prediction=-1 if label == "outlier" else 1,
        label=label,
        algorithm=ALGORITHM_NAME,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT)
