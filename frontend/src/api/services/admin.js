import api from '../client';

export const adminService = {
  getStats() { return api.get('/admin/stats'); },
  getDoctors() { return api.get('/admin/doctors'); },
  createDoctor(payload) { return api.post('/admin/doctors', payload); },
  setDoctorStatus(doctorId, action) { return api.patch(`/admin/doctors/${doctorId}/${action}`); },
  getAppointments() { return api.get('/admin/appointments'); },
  rescheduleAppointment(appointmentId, payload) { return api.patch(`/admin/appointments/${appointmentId}/reschedule`, payload); },
  getEscalations() { return api.get('/admin/sos-escalations'); },
  dispatchEscalation(alertId) { return api.patch(`/admin/sos-escalations/${alertId}/dispatch`); },
  getSlotTimes() { return api.get('/admin/slot-times'); },
  addSlotTime(time) { return api.post('/admin/slot-times', { time }); },
  removeSlotTime(slotId) { return api.delete(`/admin/slot-times/${slotId}`); },
};
