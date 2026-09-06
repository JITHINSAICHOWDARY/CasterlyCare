/**
 * CASTERLYCARE ANOMALY ENGINE
 * -----------------------------------------------------------------------
 * Phase 3.1.2
 *
 * The vitals anomaly score is now produced by the dedicated Python
 * One-Class SVM service.
 *
 * Node remains responsible for:
 *   - validating the application request
 *   - calling the ML service
 *   - normalizing the ML response
 *   - calculating longitudinal recovery trend
 *
 * The Python service is responsible for:
 *   - feature scaling
 *   - One-Class SVM inference
 *   - inlier / outlier classification
 *   - model version reporting
 * -----------------------------------------------------------------------
 */

const DEFAULT_ML_SERVICE_URL =
  process.env.ML_SERVICE_URL ||
  'http://127.0.0.1:8000';

const ML_SERVICE_TIMEOUT_MS =
  Number(
    process.env.ML_SERVICE_TIMEOUT_MS || 5000
  );

function getMlServiceUrl() {
  return DEFAULT_ML_SERVICE_URL.replace(
    /\/+$/,
    ''
  );
}

function validateVitals(vitals) {
  if (!vitals || typeof vitals !== 'object') {
    throw new Error(
      'Vitals payload is required.'
    );
  }

  const requiredFields = [
    'spo2',
    'systolic',
    'diastolic',
    'heartRate',
    'temperature',
  ];

  for (const field of requiredFields) {
    const value = Number(vitals[field]);

    if (
      !Number.isFinite(value)
    ) {
      throw new Error(
        `Invalid vital measurement: ${field}.`
      );
    }
  }

  if (
    Number(vitals.diastolic) >=
    Number(vitals.systolic)
  ) {
    throw new Error(
      'Diastolic pressure must be lower than systolic pressure.'
    );
  }
}

/**
 * Calls the dedicated Python One-Class SVM service.
 *
 * Returns the normalized contract consumed by the Node route.
 */
async function scoreVitals(vitals) {
  validateVitals(vitals);

  const controller =
    new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, ML_SERVICE_TIMEOUT_MS);

  try {
    const response =
      await fetch(
        `${getMlServiceUrl()}/score`,
        {
          method: 'POST',

          headers: {
            Accept:
              'application/json',

            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            spo2:
              Number(vitals.spo2),

            systolic:
              Number(vitals.systolic),

            diastolic:
              Number(vitals.diastolic),

            heartRate:
              Number(vitals.heartRate),

            temperature:
              Number(vitals.temperature),
          }),

          signal:
            controller.signal,
        }
      );

    let payload = null;

    try {
      payload =
        await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const detail =
        payload?.detail ||
        payload?.message ||
        `ML service returned HTTP ${response.status}.`;

      throw new Error(
        `One-Class SVM service error: ${detail}`
      );
    }

    const score =
      Number(payload?.score);

    const decisionValue =
      Number(
        payload?.decisionValue
      );

    const prediction =
      Number(
        payload?.prediction
      );

    const label =
      payload?.label === 'outlier'
        ? 'outlier'
        : 'normal';

    if (
      !Number.isFinite(score) ||
      !Number.isFinite(
        decisionValue
      ) ||
      !Number.isInteger(
        prediction
      )
    ) {
      throw new Error(
        'One-Class SVM service returned an invalid scoring response.'
      );
    }

    return {
      score: Number(
        Math.min(
          1,
          Math.max(
            0,
            score
          )
        ).toFixed(3)
      ),

      label,

      decisionValue,

      prediction,

      modelVersion:
        payload?.modelVersion ||
        'v2-one-class-svm-reference',

      algorithm:
        payload?.algorithm ||
        'One-Class SVM (RBF kernel)',
    };
  } catch (error) {
    if (
      error?.name ===
      'AbortError'
    ) {
      throw new Error(
        'The One-Class SVM service timed out.'
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Longitudinal recovery trajectory.
 *
 * history must be ordered oldest -> newest and contain:
 *   { anomalyScore }
 *
 * The result represents change in anomaly burden rather than a diagnosis.
 */
function computeTrend(history) {
  if (
    !Array.isArray(history) ||
    history.length < 3
  ) {
    return 'Insufficient Data';
  }

  const scores = history
    .map((item) =>
      Number(
        item?.anomalyScore
      )
    )
    .filter(
      (value) =>
        Number.isFinite(value)
    );

  if (
    scores.length < 3
  ) {
    return 'Insufficient Data';
  }

  /*
   * Use a rolling comparison:
   *
   * earlier window = first half
   * recent window  = second half
   *
   * Lower anomaly burden in the recent window means the
   * measurements are moving closer to the learned reference
   * population.
   */
  const split =
    Math.floor(
      scores.length / 2
    );

  const earlier =
    scores.slice(
      0,
      split
    );

  const recent =
    scores.slice(
      split
    );

  const average = (
    values
  ) =>
    values.reduce(
      (
        sum,
        value
      ) =>
        sum + value,
      0
    ) /
    values.length;

  const earlierAverage =
    average(earlier);

  const recentAverage =
    average(recent);

  const drift =
    recentAverage -
    earlierAverage;

  /*
   * Tolerances intentionally avoid overreacting to tiny
   * measurement-to-measurement changes.
   */
  if (
    drift <= -0.05
  ) {
    return 'Improving';
  }

  if (
    drift >= 0.08
  ) {
    return 'Requires Attention';
  }

  return 'Stable';
}

function getMonitoringMessage(
  label
) {
  if (
    label === 'outlier'
  ) {
    return 'Measurement outside configured monitoring parameters.';
  }

  return 'Within configured monitoring parameters.';
}

module.exports = {
  scoreVitals,
  computeTrend,
  getMonitoringMessage,
};