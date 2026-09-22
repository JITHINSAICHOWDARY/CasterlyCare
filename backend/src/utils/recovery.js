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

const { todayInAppTz } = require('./dates');

function daysBetween(startDateStr, referenceDate = new Date()) {
  if (!startDateStr) return 0;

  // Whole calendar days, counted in the hospital's timezone (see utils/dates.js)
  // so a recovery ends at local midnight, not at midnight on the server.
  const start = new Date(`${startDateStr}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return 0;

  const reference = new Date(`${todayInAppTz(new Date(referenceDate))}T00:00:00Z`);

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const elapsed = Math.round((reference.getTime() - start.getTime()) / MS_PER_DAY);

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

/**
 * Validates a recovery-length input (from signup or a doctor's adjustment
 * form): missing/blank defaults to 14 days, anything else must be a whole
 * number of days within a sane range or it's rejected (null).
 *
 * @param {*} value - raw input, typically a string from a request body
 * @returns {number|null} the validated day count, or null if invalid
 */
function normalizeRecoveryDays(value) {
  if (value === undefined || value === null || value === '') {
    return 14;
  }

  const days = Number(value);

  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return null;
  }

  return days;
}

module.exports = { computeRecovery, daysBetween, normalizeRecoveryDays };
