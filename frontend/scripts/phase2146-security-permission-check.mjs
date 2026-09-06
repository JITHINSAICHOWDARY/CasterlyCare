import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = path.join(root, 'src');
let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) { console.log(`PASS ${label}`); passed += 1; }
  else { console.error(`FAIL ${label}`); failed += 1; }
}
function read(rel) { return fs.readFileSync(path.join(src, rel), 'utf8'); }

const app = read('App.jsx');
const routes = read('config/routes.js');
const protectedRoute = read('components/ProtectedRoute.jsx');
const auth = read('context/AuthContext.jsx');
const client = read('api/client.js');

check('admin routes protected by admin role', /ProtectedRoute role="admin"/.test(app));
check('doctor routes protected by doctor role', /ProtectedRoute role="doctor"/.test(app));
check('patient routes protected by patient role', /ProtectedRoute role="patient"/.test(app));
check('unauthenticated users redirect to login', /<Navigate to="\/login"/.test(protectedRoute));
check('wrong-role users redirect to their role home', /roleHome\[user\.role\]/.test(protectedRoute));
check('authenticated public routes redirect to role home', /PublicOnlyRoute/.test(app) && /roleHome\[user\.role\]/.test(app));
check('session token and user are cleared on logout', /removeItem\(TOKEN_KEY\)/.test(auth) && /removeItem\(USER_KEY\)/.test(auth));
check('API client attaches bearer token centrally', /Authorization = `Bearer \$\{token\}`/.test(client));
check('401 responses clear session', /normalized\.status === 401/.test(client) && /removeItem\(TOKEN_KEY\)/.test(client));
check('admin route map contains expected surfaces', ['/admin','/admin/doctors','/admin/appointments','/admin/escalations'].every((p)=>routes.includes(p)));
check('doctor route map contains expected surfaces', ['/doctor','/doctor/profile','/doctor/patients','/doctor/appointments','/doctor/inbox'].every((p)=>routes.includes(p)));
check('patient route map contains expected surfaces', ['/patient','/patient/profile','/patient/lab-reports','/patient/appointments','/patient/diet','/patient/medicines','/patient/assessment'].every((p)=>routes.includes(p)));

const pageGroups = {
  admin: ['AdminOverview.jsx','AdminDoctors.jsx','AdminAppointments.jsx','AdminEscalations.jsx'],
  doctor: ['DoctorHome.jsx','DoctorProfile.jsx','DoctorPatients.jsx','DoctorPatientDetails.jsx','DoctorAppointments.jsx','DoctorInbox.jsx'],
  patient: ['PatientHome.jsx','PatientProfile.jsx','PatientLabReports.jsx','PatientAppointments.jsx','PatientDiet.jsx','PatientMedicines.jsx','PatientAssessment.jsx'],
};
const groupPaths = { admin:'pages/admin', doctor:'pages/doctor', patient:'pages/patient' };
for (const [role, files] of Object.entries(pageGroups)) {
  for (const file of files) {
    const content = fs.readFileSync(path.join(src, groupPaths[role], file), 'utf8');
    check(`${role} page ${file} uses only its service boundary`, !/(services\/admin|services\/doctor|services\/patient)/.test(content) || content.includes(`services/${role}`));
  }
}

const allPageFiles = Object.entries(pageGroups).flatMap(([role, files]) => files.map((file) => ({role, file})));
for (const { role, file } of allPageFiles) {
  const content = fs.readFileSync(path.join(src, groupPaths[role], file), 'utf8');
  if (role !== 'admin') check(`${role} page ${file} does not import admin service`, !content.includes('services/admin'));
  if (role !== 'doctor') check(`${role} page ${file} does not import doctor service`, !content.includes('services/doctor'));
  if (role !== 'patient') check(`${role} page ${file} does not import patient service`, !content.includes('services/patient'));
}

const realtime = read('context/RealtimeContext.jsx');
check('realtime provider requires authenticated session', /if \(!isAuthenticated\)/.test(realtime));
check('realtime subscribes to current authenticated socket', /getSocket\(\)/.test(realtime));

const report = `CASTERLYCARE — PHASE 2.14.6\nCROSS-ROLE SECURITY & PERMISSION INTEGRATION VALIDATION\n\nResult: ${passed} PASS / ${failed} FAIL\n\nScope:\n- Admin / Doctor / Patient protected-route matrix\n- Public-route and session handling\n- Central bearer-token handling and 401 session clearing\n- Role route map coverage\n- Page-to-service boundary checks\n- Realtime authentication boundary\n`;
fs.writeFileSync(path.join(root, 'PHASE_2_14_6_ACCEPTANCE.txt'), report);
console.log(`\\nRESULT ${passed} PASS / ${failed} FAIL`);
if (failed) process.exit(1);
