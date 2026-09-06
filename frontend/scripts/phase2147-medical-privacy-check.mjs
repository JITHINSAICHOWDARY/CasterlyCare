import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let pass = 0;
let fail = 0;
const check = (label, condition) => {
  if (condition) { pass++; console.log(`PASS ${label}`); }
  else { fail++; console.log(`FAIL ${label}`); }
};

const patientService = read('src/api/services/patient.js');
const labPage = read('src/pages/patient/PatientLabReports.jsx');
const doctorDetails = read('src/pages/doctor/DoctorPatientDetails.jsx');
const client = read('src/api/client.js');
const routes = read('src/config/routes.js');
const app = read('src/App.jsx');
const nav = read('src/config/navigation.js');

check('lab verification endpoint is isolated in patient service', patientService.includes("verifyLabReports(password) { return api.post('/patient/lab-reports/verify', { password }); }"));
check('lab report retrieval requires step-up header', patientService.includes("'X-Step-Up-Token': stepUpToken"));
check('lab reports route exists', app.includes('path="/patient/lab-reports"'));
check('lab reports is in patient navigation', nav.includes("to: '/patient/lab-reports'"));
check('lab reports only accepts patient-file URL path', labPage.includes("url.pathname.startsWith('/uploads/patient_files/')"));
check('lab report URL origin is checked', labPage.includes('url.origin === apiUrl.origin'));
check('doctor file links are restricted to patient-files path', doctorDetails.includes("file.fileUrl.startsWith('/uploads/patient_files/')"));
check('shared API client attaches bearer token', client.includes('Authorization') && client.includes('Bearer'));
check('step-up token is not stored as a persistent auth token', !patientService.match(/localStorage[^\n]*stepUpToken/i) && !labPage.match(/localStorage[^\n]*stepUpToken/i));
check('lab reports remains patient-role scoped by route namespace', routes.includes("labReports: '/patient/lab-reports'"));

console.log(`RESULT ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
