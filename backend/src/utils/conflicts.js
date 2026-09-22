/*
 * The database enforces "one upcoming appointment per doctor (and per
 * patient) per date+time" (see ensureAppointmentIndexes in server.js).
 * When two requests race for the same slot, the loser hits that constraint;
 * this turns it into a normal 409 instead of a 500.
 */
function respondIfSlotTaken(error, res) {
  if (error && error.name === 'SequelizeUniqueConstraintError') {
    const text = 'That time was just taken. Please choose another.';
    res.status(409).json({ error: text, message: text });
    return true;
  }
  return false;
}

module.exports = { respondIfSlotTaken };
