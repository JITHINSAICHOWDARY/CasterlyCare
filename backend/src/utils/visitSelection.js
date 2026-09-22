/**
 * Validate appointment category/service combination.
 *
 * Shared by both the doctor- and patient-side appointment-booking
 * endpoints so the two never drift apart on which service types are
 * valid for which visit category (see Appointment.visitCategory's
 * ENUM in models/Appointment.js for the two valid categories).
 */
function isValidVisitSelection(visitCategory, serviceType) {
  const homeServices = ['dressing', 'physiotherapy', 'vitals_check'];
  const hospitalServices = ['doctor_visit', 'pharmacy_visit'];

  if (visitCategory === 'home_visit') {
    return homeServices.includes(serviceType);
  }

  if (visitCategory === 'hospital_visit') {
    return hospitalServices.includes(serviceType);
  }

  return false;
}

module.exports = { isValidVisitSelection };
