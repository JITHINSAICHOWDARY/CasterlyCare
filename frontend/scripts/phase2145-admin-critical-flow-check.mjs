import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let pass = 0;
let fail = 0;
const results = [];
const check = (name, condition, detail = '') => {
  if (condition) pass += 1; else fail += 1;
  results.push(`${condition ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
};
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const app = read('src/App.jsx');
const routes = read('src/config/routes.js');
const nav = read('src/config/navigation.js');
const service = read('src/api/services/admin.js');
const realtime = read('src/config/realtimeEvents.js');

const pages = [
  'src/pages/admin/AdminOverview.jsx',
  'src/pages/admin/AdminDoctors.jsx',
  'src/pages/admin/AdminAppointments.jsx',
  'src/pages/admin/AdminEscalations.jsx',
];

for (const file of pages) {
  const text = read(file);
  check(`${path.basename(file)} exists`, text.length > 0);
  check(`${path.basename(file)} balanced braces`, (text.match(/\{/g) || []).length === (text.match(/\}/g) || []).length);
  check(`${path.basename(file)} balanced parentheses`, (text.match(/\(/g) || []).length === (text.match(/\)/g) || []).length);
}

for (const route of ['/admin', '/admin/doctors', '/admin/appointments', '/admin/escalations']) {
  check(`Admin route registered: ${route}`, app.includes(`path="${route}"`));
  check(`Admin protected route namespace: ${route}`, routes.includes(route));
}

for (const method of ['getStats', 'getDoctors', 'createDoctor', 'setDoctorStatus', 'getAppointments', 'rescheduleAppointment', 'getEscalations', 'dispatchEscalation']) {
  check(`Admin service exposes ${method}`, service.includes(`${method}(`));
}

check('Admin navigation exposes dashboard', /admin/.test(nav) && /doctors/.test(nav) && /appointments/.test(nav) && /escalations/.test(nav));
check('Admin overview loads operational metrics', /getStats\(\)/.test(read('src/pages/admin/AdminOverview.jsx')));
check('Admin overview links to doctor management', /\/admin\/doctors/.test(read('src/pages/admin/AdminOverview.jsx')));
check('Admin overview links to master calendar', /\/admin\/appointments/.test(read('src/pages/admin/AdminOverview.jsx')));
check('Admin overview links to escalations', /\/admin\/escalations/.test(read('src/pages/admin/AdminOverview.jsx')));

const doctors = read('src/pages/admin/AdminDoctors.jsx');
check('Doctor creation UI present', /createDoctor/.test(doctors) && /Add a Doctor|Add Doctor/.test(doctors));
check('Doctor activation/deactivation UI present', /setDoctorStatus/.test(doctors) && /deactivate|reactivate/i.test(doctors));
check('Doctor Unique ID displayed', /uniqueDoctorId/i.test(doctors));
check('Doctor search/filter present', /search/i.test(doctors) && /filter/i.test(doctors));

const appointments = read('src/pages/admin/AdminAppointments.jsx');
check('Master calendar loads appointments', /getAppointments\(\)/.test(appointments));
check('Clash detection visible', /isClash|clash/i.test(appointments));
check('Appointment reschedule workflow present', /rescheduleAppointment/.test(appointments) && /date/.test(appointments) && /time/.test(appointments));
check('Appointment status filtering present', /statusFilter/.test(appointments));

const escalations = read('src/pages/admin/AdminEscalations.jsx');
check('SOS escalation queue loads', /getEscalations\(\)/.test(escalations));
check('Emergency dispatch action present', /dispatchEscalation/.test(escalations) && /dispatch/i.test(escalations));
check('Dispatch confirmation present', /Confirm dispatch|initiate emergency dispatch/i.test(escalations));
check('Duplicate dispatch protection present', /dispatchingId|disabled=.*dispatch/i.test(escalations));

check('Appointment realtime contract present', realtime.includes('appointment_created'));
check('SOS realtime contract present', realtime.includes('sos_created'));
check('Doctor duty realtime contract present', realtime.includes('doctor_duty_updated'));
check('Recovery realtime contract present', realtime.includes('recovery_updated'));
check('Clinical-record realtime contract present', realtime.includes('clinical_record_updated'));

const protectedRoute = read('src/components/ProtectedRoute.jsx');
check('Admin role is enforced by ProtectedRoute', /role/.test(protectedRoute) && /allowedRole|user\.role|role ===/.test(protectedRoute));

console.log('CASTERLYCARE — PHASE 2.14.5 ADMIN CRITICAL FLOW CHECK');
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);
for (const result of results) console.log(result);
process.exitCode = fail ? 1 : 0;
