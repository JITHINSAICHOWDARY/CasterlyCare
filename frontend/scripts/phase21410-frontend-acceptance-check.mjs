import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let pass = 0, fail = 0;
const results = [];
const check = (name, condition, detail='') => {
  if (condition) pass++; else fail++;
  results.push(`${condition ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
};
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const jsxFiles = [];
function collectJsx(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectJsx(full);
    else if (entry.isFile() && entry.name.endsWith('.jsx')) jsxFiles.push(path.relative(root, full));
  }
}
collectJsx(path.join(root, 'src'));

const app = read('src/App.jsx');
const nav = read('src/config/navigation.js');
const routes = read('src/config/routes.js');
const css = read('src/index.css');
const realtime = read('src/config/realtimeEvents.js');
const packageJson = JSON.parse(read('package.json'));

for (const file of ['src/App.jsx','src/main.jsx','src/index.css','src/config/navigation.js','src/config/routes.js','src/context/AuthContext.jsx','src/context/RealtimeContext.jsx']) {
  check(`${file} exists`, exists(file));
}
check('App contains all role namespaces', ['/admin','/doctor','/patient'].every((p) => app.includes(p)));
check('Admin routes cover overview/doctors/appointments/escalations', ['/admin','/admin/doctors','/admin/appointments','/admin/escalations'].every((p) => app.includes(p)));
check('Doctor routes cover home/profile/patients/details/appointments/inbox', ['/doctor','/doctor/profile','/doctor/patients','/doctor/patients/:patientId','/doctor/appointments','/doctor/inbox'].every((p) => app.includes(p)));
check('Patient routes cover home/profile/lab/appointments/diet/medicines/assessment', ['/patient','/patient/profile','/patient/lab-reports','/patient/appointments','/patient/diet','/patient/medicines','/patient/assessment'].every((p) => app.includes(p)));
check('ProtectedRoute has role guards', app.includes('ProtectedRoute role="admin"') && app.includes('ProtectedRoute role="doctor"') && app.includes('ProtectedRoute role="patient"'));
check('Authenticated public routes redirect by role', app.includes('PublicOnlyRoute') && app.includes('roleHome[user.role]'));
check('Unknown routes return to root redirect', app.includes("path=\"*\"") && app.includes("to=\"/\""));

const requiredAdmin = ['AdminOverview.jsx','AdminDoctors.jsx','AdminAppointments.jsx','AdminEscalations.jsx'];
const requiredDoctor = ['DoctorHome.jsx','DoctorProfile.jsx','DoctorPatients.jsx','DoctorPatientDetails.jsx','DoctorAppointments.jsx','DoctorInbox.jsx'];
const requiredPatient = ['PatientHome.jsx','PatientProfile.jsx','PatientLabReports.jsx','PatientAppointments.jsx','PatientDiet.jsx','PatientMedicines.jsx','PatientAssessment.jsx'];
for (const f of requiredAdmin) check(`Admin page present: ${f}`, exists(`src/pages/admin/${f}`));
for (const f of requiredDoctor) check(`Doctor page present: ${f}`, exists(`src/pages/doctor/${f}`));
for (const f of requiredPatient) check(`Patient page present: ${f}`, exists(`src/pages/patient/${f}`));

for (const file of jsxFiles) {
  const text = read(file);
  check(`${file} balanced braces`, (text.match(/\{/g)||[]).length === (text.match(/\}/g)||[]).length);
  check(`${file} balanced parentheses`, (text.match(/\(/g)||[]).length === (text.match(/\)/g)||[]).length);
  const imageTags = [...text.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
  check(`${file} image alt coverage`, imageTags.every(tag => /\balt\s*=/.test(tag)));
  check(`${file} no raw window.alert`, !/window\.alert\s*\(/.test(text));
}

check('Global focus-visible styling exists', /:focus-visible\s*\{/.test(css));
check('Reduced-motion styling exists', /prefers-reduced-motion/.test(css));
check('Responsive media queries exist', /@media\s*\(max-width:/.test(css));
check('Realtime shell notice styling exists', /\.realtime-shell-notice/.test(css));
check('Mobile touch target hardening exists', /touch-action:\s*manipulation/.test(css));

const eventNames = ['appointment_created','appointment_updated','appointment_completed','appointment_rescheduled','appointment_cancelled','sos_created','sos_updated','sos_resolved','doctor_duty_updated','recovery_updated','care_episode_completed','medicine_updated','file_uploaded','note_updated','restriction_updated','clinical_record_updated'];
for (const event of eventNames) check(`Realtime event retained: ${event}`, realtime.includes(event));

check('Integration command present', Boolean(packageJson.scripts?.['test:integration']));
check('Role-flow command present', Boolean(packageJson.scripts?.['test:role-flows']));
check('Patient critical command present', Boolean(packageJson.scripts?.['test:patient-critical']));
check('Doctor critical command present', Boolean(packageJson.scripts?.['test:doctor-critical']));
check('Admin critical command present', Boolean(packageJson.scripts?.['test:admin-critical']));
check('Security command present', Boolean(packageJson.scripts?.['test:security-permissions']));
check('Medical privacy command present', Boolean(packageJson.scripts?.['test:medical-privacy']));
check('Appointment command present', Boolean(packageJson.scripts?.['test:appointments']));
check('Failure-mode command present', Boolean(packageJson.scripts?.['test:failure-modes']));

for (const forbidden of ['vite.svg','react.svg','lannister-care starter','lannister care demo']) {
  const filesToScan = ['README.md','index.html',...jsxFiles.map(f=>f)];
  const hit = filesToScan.some(file => read(file).toLowerCase().includes(forbidden));
  check(`No obsolete/demo reference: ${forbidden}`, !hit);
}

console.log('CASTERLYCARE — PHASE 2.14.10 FRONTEND ACCEPTANCE CHECK');
console.log(`PASS: ${pass}`); console.log(`FAIL: ${fail}`); results.forEach(r => console.log(r));
process.exitCode = fail ? 1 : 0;
