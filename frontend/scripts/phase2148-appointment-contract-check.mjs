import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let pass = 0;
let fail = 0;
const results = [];

function check(name, condition, detail = '') {
  if (condition) pass += 1;
  else fail += 1;
  results.push(`${condition ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

const patientService = read('src/api/services/patient.js');
const doctorService = read('src/api/services/doctor.js');
const adminService = read('src/api/services/admin.js');
const patientPage = read('src/pages/patient/PatientAppointments.jsx');
const doctorPage = read('src/pages/doctor/DoctorAppointments.jsx');
const adminPage = read('src/pages/admin/AdminAppointments.jsx');
const realtime = read('src/config/realtimeEvents.js');

for (const [name, text] of [
  ['PatientAppointments.jsx', patientPage],
  ['DoctorAppointments.jsx', doctorPage],
  ['AdminAppointments.jsx', adminPage],
]) {
  check(`${name} exists`, text.length > 0);
  check(`${name} balanced braces`, (text.match(/\{/g) || []).length === (text.match(/\}/g) || []).length);
  check(`${name} balanced parentheses`, (text.match(/\(/g) || []).length === (text.match(/\)/g) || []).length);
}

check('Patient service has appointment retrieval', /getAppointments\(\)/.test(patientService));
check('Patient service has booking contract', /bookAppointment\(payload\)/.test(patientService));
check('Patient service has reschedule contract', /rescheduleAppointment\(appointmentId, payload\)/.test(patientService));
check('Patient service has cancellation contract', /cancelAppointment\(appointmentId\)/.test(patientService));
check('Doctor service has appointment retrieval', /getAppointments\(\)/.test(doctorService));
check('Doctor service has completion contract', /completeAppointment\(appointmentId\)/.test(doctorService));
check('Doctor service has reschedule contract', /rescheduleAppointment\(appointmentId, payload\)/.test(doctorService));
check('Admin service has appointment retrieval', /getAppointments\(\)/.test(adminService));
check('Admin service has reschedule contract', /rescheduleAppointment\(appointmentId, payload\)/.test(adminService));

check('Patient page wires reschedule', /patientService\.rescheduleAppointment/.test(patientPage));
check('Patient page wires cancellation', /patientService\.cancelAppointment/.test(patientPage));
check('Patient page exposes booking', /patientService\.bookAppointment/.test(patientPage));
check('Patient page supports home visit', /Home Visit/i.test(patientPage));
check('Patient page supports hospital visit', /Hospital Visit/i.test(patientPage));
check('Patient page validates date and time', /type="date"/.test(patientPage) && /type="time"/.test(patientPage));
check('Patient page prevents obvious past reschedule date', /min=\{today\}/.test(patientPage));
check('Patient page has explicit action feedback', /actionError|Could not|could not be rescheduled|could not be cancelled/i.test(patientPage));
check('Patient page preserves appointment history', /history/i.test(patientPage));

check('Doctor page wires completion', /doctorService\.completeAppointment/.test(doctorPage));
check('Doctor page wires rescheduling', /doctorService\.rescheduleAppointment/.test(doctorPage));
check('Doctor page validates date and time', /type="date"/.test(doctorPage) && /type="time"/.test(doctorPage));

check('Admin page wires rescheduling', /adminService\.rescheduleAppointment/.test(adminPage));
check('Admin page preserves clash detection', /isClash|clash/i.test(adminPage));
check('Admin page has date and time reschedule controls', /type="date"/.test(adminPage) && /type="time"/.test(adminPage));

check('Realtime appointment-created contract present', realtime.includes('appointment_created'));
check('Realtime appointment-updated contract present', realtime.includes('appointment_updated'));

check('Patient cancellation is not claimed as a client-side state mutation', !/setAppointments\(.*cancel/i.test(patientPage));
check('Patient reschedule relies on backend response', /await patientService\.rescheduleAppointment/.test(patientPage));
check('Patient cancellation relies on backend response', /await patientService\.cancelAppointment/.test(patientPage));

console.log('CASTERLYCARE — PHASE 2.14.8 APPOINTMENT CONTRACT CHECK');
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);
for (const line of results) console.log(line);
process.exitCode = fail ? 1 : 0;
