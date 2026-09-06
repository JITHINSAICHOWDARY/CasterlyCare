/*
 * =========================================================
 * RECOVERY TIME MATH
 * =========================================================
 *
 * Previously, `CareEpisode.daysRemaining` / `Surgery.recoveryDaysRemaining`
 * were plain stored counters that only ever changed when a doctor pressed
 * the [+]/[-] adjustment buttons - nothing ever decremented them as real
 * calendar days actually passed, so a patient's recovery countdown stayed
 * frozen forever once set.
 *
 * This computes recovery progress live from `startDate` and
 * `expectedRecoveryDays` every time it's needed, so it is always correct
 * regardless of how long the server has been running or whether any
 * scheduled job has fired recently. `server.js` also runs a daily job
 * (see utils/scheduler.js) that writes the freshly computed values back
 * into the stored columns, purely so that any other code path that reads
 * the raw database value directly still sees a reasonably fresh number -
 * but the computation here is the actual source of truth.
 */

function daysBetween(startDateStr, referenceDate = new Date()) {
  if (!startDateStr) return 0;

  const start = new Date(`${startDateStr}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 0;

  const reference = new Date(referenceDate);
  reference.setHours(0, 0, 0, 0);

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const elapsed = Math.floor(
    (reference.getTime() - start.getTime()) / MS_PER_DAY
  );

  return Math.max(0, elapsed);
}

/**
 * Computes how many days of a recovery plan have elapsed and how many
 * remain, based purely on the calendar - not on any previously stored
 * counter.
 *
 * @param {string} startDateStr - DATEONLY string, e.g. "2026-09-06"
 * @param {number} expectedRecoveryDays - total planned recovery length
 * @returns {{ daysCompleted: number, daysRemaining: number }}
 */
function computeRecovery(startDateStr, expectedRecoveryDays) {
  const totalDays = Number.isFinite(Number(expectedRecoveryDays))
    ? Math.max(0, Number(expectedRecoveryDays))
    : 0;

  const daysElapsed = daysBetween(startDateStr);
  const daysCompleted = Math.min(totalDays, daysElapsed);
  const daysRemaining = Math.max(0, totalDays - daysCompleted);

  return { daysCompleted, daysRemaining };
}

module.exports = { computeRecovery, daysBetween };
