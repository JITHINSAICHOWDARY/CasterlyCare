import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let pass = 0;
let fail = 0;
const results = [];

function check(name, condition, detail = '') {
  if (condition) {
    pass += 1;
    results.push(`PASS | ${name}${detail ? ` | ${detail}` : ''}`);
  } else {
    fail += 1;
    results.push(`FAIL | ${name}${detail ? ` | ${detail}` : ''}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const app = read('src/App.jsx');
const routes = read('src/config/routes.js');
const services = read('src/api/services/patient.js');
const auth = read('src/context/AuthContext.jsx');
const realtime = read('src/config/realtimeEvents.js');

const pageFiles = [
  'src/pages/patient/PatientHome.jsx',
  'src/pages/patient/PatientProfile.jsx',
  'src/pages/patient/PatientLabReports.jsx',
  'src/pages/patient/PatientAppointments.jsx',
  'src/pages/patient/PatientDiet.jsx',
  'src/pages/patient/PatientMedicines.jsx',
  'src/pages/patient/PatientAssessment.jsx',
];

for (const file of pageFiles) {
  const text = read(file);
  check(`${path.basename(file)} exists`, text.length > 0);
  check(`${path.basename(file)} has balanced JSX delimiters`,
    (text.match(/\{/g) || []).length === (text.match(/\}/g) || []).length &&
    (text.match(/\(/g) || []).length === (text.match(/\)/g) || []).length);
}

check('Patient protected namespace registered', app.includes('ProtectedRoute role="patient"'));
check('Patient home route registered', app.includes('path="/patient"'));
check('Patient profile route registered', app.includes('path="/patient/profile"'));
check('Patient lab reports route registered', app.includes('path="/patient/lab-reports"'));
check('Patient appointments route registered', app.includes('path="/patient/appointments"'));
check('Patient diet route registered', app.includes('path="/patient/diet"'));
check('Patient medicines route registered', app.includes('path="/patient/medicines"'));
check('Patient assessment route registered', app.includes('path="/patient/assessment"'));

for (const [name, method] of [
  ['home', 'getHome'], ['SOS', 'sendSos'], ['profile', 'getProfile'], ['profile update', 'updateProfile'],
  ['profile photo', 'uploadProfilePhoto'], ['lab verify', 'verifyLabReports'], ['lab reports', 'getLabReports'],
  ['appointments', 'getAppointments'], ['book appointment', 'bookAppointment'],
  ['reschedule appointment', 'rescheduleAppointment'], ['cancel appointment', 'cancelAppointment'],
  ['diet check', 'checkDiet'], ['medicines', 'getMedicines'], ['assessment history', 'getAssessmentHistory'],
  ['assessment submit', 'submitAssessment'], ['Kingslayer', 'askKingslayer'],
  ['emergency active', 'getEmergencyChatActive'], ['emergency start', 'startEmergencyChat'],
  ['emergency message', 'sendEmergencyMessage'],
]) {
  check(`Patient service exposes ${name}`, services.includes(`${method}(`));
}

check('Lab reports uses step-up header', services.includes("'X-Step-Up-Token'"));
check('Patient signup keeps Doctor ID normalization', auth.includes('doctorUniqueId: payload.doctorUniqueId?.trim().toUpperCase()'));
check('Realtime appointment event exists', realtime.includes('appointment_updated'));
check('Realtime SOS event exists', realtime.includes('sos_created'));
check('Realtime clinical-record event exists', realtime.includes('clinical_record_updated'));

const criticalPageExpectations = {
  'PatientHome.jsx': ['sendSos', 'getHome', 'Medicine', 'Appointment'],
  'PatientProfile.jsx': ['getProfile', 'updateProfile', 'uploadProfilePhoto'],
  'PatientLabReports.jsx': ['verifyLabReports', 'getLabReports'],
  'PatientAppointments.jsx': ['getAppointments', 'bookAppointment', 'rescheduleAppointment', 'cancelAppointment'],
  'PatientDiet.jsx': ['checkDiet', 'getProfile'],
  'PatientMedicines.jsx': ['getMedicines'],
  'PatientAssessment.jsx': ['getAssessmentHistory', 'submitAssessment'],
};

for (const [fileName, needles] of Object.entries(criticalPageExpectations)) {
  const file = pageFiles.find((candidate) => candidate.endsWith(fileName));
  const text = read(file);
  for (const needle of needles) check(`${fileName} wires ${needle}`, text.includes(needle));
}

const home = read('src/pages/patient/PatientHome.jsx');
const lab = read('src/pages/patient/PatientLabReports.jsx');
const appointments = read('src/pages/patient/PatientAppointments.jsx');
const assessment = read('src/pages/patient/PatientAssessment.jsx');
const diet = read('src/pages/patient/PatientDiet.jsx');
const medicines = read('src/pages/patient/PatientMedicines.jsx');

check('Patient home includes two-step SOS confirmation', /ConfirmModal/.test(home) && /confirm/i.test(home));
check('Patient lab vault has password verification UI', /verifyLabReports/.test(lab) && /password/i.test(lab));
check('Appointment wizard supports home/hospital categories', /Home Visit|Hospital Visit|home visit|hospital visit/i.test(appointments));
check('Appointment wizard includes calendar/time selection', /calendar|date|time/i.test(appointments));
check('Diet presents safe/caution/restricted states', /Safe|Caution|Restricted/.test(diet));
check('Medicines presents dosage/timing information', /dosage|time|timing/i.test(medicines));
check('Assessment presents professional monitoring language', /monitoring|configured monitoring parameters|clinical review/i.test(assessment));
check('Assessment preserves longitudinal history/trend UI', /history|trend|trajectory/i.test(assessment));
check('Emergency chat remains distinct from Kingslayer', home.includes('Kingslayer') && /Emergency Chat/.test(home));

console.log('CASTERLYCARE — PHASE 2.14.3 PATIENT CRITICAL FLOW CHECK');
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);
for (const line of results) console.log(line);
process.exitCode = fail ? 1 : 0;
