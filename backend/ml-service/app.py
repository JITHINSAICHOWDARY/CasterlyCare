"""
CasterlyCare One-Class SVM Service
-----------------------------------

This service provides the anomaly-detection model used by the
Node/Express backend.

IMPORTANT:
The reference training population below is a synthetic/reference
distribution intended to make the development system functional.
It is NOT a clinically validated postoperative training dataset.

Before real clinical deployment, replace the reference training
population with an appropriately governed, clinically validated
postoperative vitals dataset.
"""

from __future__ import annotations

import os
from typing import List

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import OneClassSVM


APP_NAME = "CasterlyCare One-Class SVM Service"
MODEL_VERSION = "v2-one-class-svm-reference"

HOST = os.getenv("ML_SERVICE_HOST", "127.0.0.1")
PORT = int(os.getenv("ML_SERVICE_PORT", "8000"))

# ---------------------------------------------------------------------
# Development/reference postoperative monitoring population
# ---------------------------------------------------------------------
#
# These are NOT patient records.
#
# They represent a stable reference distribution around the monitoring
# ranges currently used by the application.
#
# Feature order:
#   SpO2
#   systolic BP
#   diastolic BP
#   heart rate
#   temperature Fahrenheit
#
# The model learns the multivariate shape of this reference population
# rather than applying independent threshold rules.
# ---------------------------------------------------------------------

REFERENCE_CENTERS = np.array(
    [
        [98.0, 118.0, 74.0, 72.0, 98.2],
        [97.5, 112.0, 70.0, 68.0, 98.0],
        [98.5, 121.0, 76.0, 76.0, 98.4],
        [97.0, 108.0, 68.0, 65.0, 97.8],
        [99.0, 125.0, 78.0, 80.0, 98.6],
    ],
    dtype=float,
)

REFERENCE_SCALE = np.array(
    [
        1.2,
        8.0,
        6.0,
        7.0,
        0.45,
    ],
    dtype=float,
)


def build_reference_training_set(
    samples_per_center: int = 80,
) -> np.ndarray:
    """
    Build a deterministic synthetic/reference normal population.

    A fixed RNG is used so development results remain reproducible.
    """

    rng = np.random.default_rng(20260904)

    populations: List[np.ndarray] = []

    for center in REFERENCE_CENTERS:
        samples = rng.normal(
            loc=center,
            scale=REFERENCE_SCALE,
            size=(samples_per_center, 5),
        )

        # Keep the reference population inside reasonable monitoring
        # limits so the model learns a coherent "normal recovery"
        # development distribution.
        samples[:, 0] = np.clip(
            samples[:, 0],
            94.0,
            100.0,
        )

        samples[:, 1] = np.clip(
            samples[:, 1],
            90.0,
            130.0,
        )

        samples[:, 2] = np.clip(
            samples[:, 2],
            60.0,
            85.0,
        )

        samples[:, 3] = np.clip(
            samples[:, 3],
            55.0,
            100.0,
        )

        samples[:, 4] = np.clip(
            samples[:, 4],
            97.0,
            99.5,
        )

        populations.append(samples)

    return np.vstack(populations)


# ---------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------

reference_training_data = build_reference_training_set()

model = Pipeline(
    [
        (
            "scaler",
            StandardScaler(),
        ),
        (
            "one_class_svm",
            OneClassSVM(
                kernel="rbf",
                gamma="scale",
                nu=0.08,
            ),
        ),
    ]
)

model.fit(reference_training_data)


# ---------------------------------------------------------------------
# API
# ---------------------------------------------------------------------

app = FastAPI(
    title=APP_NAME,
    version=MODEL_VERSION,
)


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
    """
    Reject obviously malformed vital combinations before ML scoring.

    These checks are data-quality protections, not clinical diagnoses.
    """

    if vitals.diastolic >= vitals.systolic:
        raise HTTPException(
            status_code=400,
            detail="Diastolic pressure must be lower than systolic pressure.",
        )


def score_to_unit_interval(
    decision_value: float,
) -> float:
    """
    Convert the signed One-Class SVM decision value into a stable
    0..1 monitoring score where larger values indicate greater
    deviation from the learned reference population.

    This is a presentation-oriented normalization and is NOT a
    probability of disease.
    """

    # Positive decision values indicate inliers and negative values
    # indicate outliers in scikit-learn's One-Class SVM.
    #
    # A logistic transformation creates a bounded deviation score.
    magnitude = float(decision_value)

    score = 1.0 / (1.0 + np.exp(4.0 * magnitude))

    return float(np.clip(score, 0.0, 1.0))


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": APP_NAME,
        "modelVersion": MODEL_VERSION,
        "algorithm": "One-Class SVM",
        "trainingPopulation": "synthetic-reference-development-population",
    }


@app.post(
    "/score",
    response_model=ScoreResponse,
)
def score_vitals(
    vitals: VitalsRequest,
) -> ScoreResponse:
    validate_relationships(vitals)

    vector = np.array(
        [
            [
                vitals.spo2,
                vitals.systolic,
                vitals.diastolic,
                vitals.heartRate,
                vitals.temperature,
            ]
        ],
        dtype=float,
    )

    prediction_array = model.predict(vector)
    decision_array = model.decision_function(vector)

    prediction = int(prediction_array[0])
    decision_value = float(decision_array[0])

    score = score_to_unit_interval(
        decision_value
    )

    label = (
        "normal"
        if prediction == 1
        else "outlier"
    )

    return ScoreResponse(
        modelVersion=MODEL_VERSION,
        score=round(score, 6),
        decisionValue=round(
            decision_value,
            6,
        ),
        prediction=prediction,
        label=label,
        algorithm="One-Class SVM (RBF kernel)",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
    )