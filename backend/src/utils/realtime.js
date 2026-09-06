/*
 * =========================================================
 * REALTIME EMIT HELPERS
 * =========================================================
 *
 * These event names are a deliberate mirror of the frontend's
 * event contract in frontend/src/config/realtimeEvents.js.
 * Route handlers should use these helpers instead of calling
 * io.emit()/io.to().emit() directly with ad hoc names, so the
 * two sides of the contract cannot drift apart again.
 *
 * Rooms are joined server-side in server.js's Socket.IO
 * connection handler:
 *   - user:<id>    every authenticated connection (patient or doctor)
 *   - doctor:<id>  doctor connections only
 *   - role:admin   admin connections only
 */

function notifyUser(io, userId, event, payload) {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
}

function notifyDoctor(io, doctorId, event, payload) {
  if (!io || !doctorId) return;
  io.to(`doctor:${doctorId}`).emit(event, payload);
}

function notifyAdmins(io, event, payload) {
  if (!io) return;
  io.to('role:admin').emit(event, payload);
}

/*
 * Most appointment/recovery/clinical-record changes are
 * relevant to both the patient and their doctor, so this
 * fires the same event at both rooms in one call.
 */
function notifyPatientAndDoctor(
  io,
  patientId,
  doctorId,
  event,
  payload
) {
  notifyUser(io, patientId, event, payload);
  notifyDoctor(io, doctorId, event, payload);
}

module.exports = {
  notifyUser,
  notifyDoctor,
  notifyAdmins,
  notifyPatientAndDoctor,
};
