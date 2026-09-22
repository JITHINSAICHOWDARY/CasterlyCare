/*
 * Hospital-local dates and times.
 *
 * Appointment dates/times are entered and shown in the hospital's own
 * timezone, but the server may run in UTC (most hosts do). Using
 * new Date().toISOString() therefore gives the wrong "today" for part of
 * the day (in India, midnight to 5:30 AM). Everything that compares against
 * "now" goes through here instead.
 */
const TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

function parts(date = new Date()) {
  const map = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(date)
    .forEach((part) => {
      map[part.type] = part.value;
    });
  return map;
}

/** "YYYY-MM-DD" for today in the hospital timezone. */
function todayInAppTz(date = new Date()) {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "YYYY-MM-DD HH:mm" for right now; compares correctly as a string. */
function nowStamp(date = new Date()) {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** "YYYY-MM-DD HH:mm" for an appointment's date and time. */
function stampOf(date, time) {
  return `${date} ${time}`;
}

/** True for a real calendar date written as YYYY-MM-DD. */
function isRealDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

module.exports = { TIMEZONE, todayInAppTz, nowStamp, stampOf, isRealDate };
