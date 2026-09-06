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

const files = [
  'src/api/services/auth.js',
  'src/api/services/admin.js',
  'src/api/services/doctor.js',
  'src/api/services/patient.js',
  'src/config/routes.js',
  'src/config/navigation.js',
  'src/config/realtimeEvents.js',
  'src/context/RealtimeContext.jsx',
];

for (const rel of files) {
  check(`Required integration file exists: ${rel}`, fs.existsSync(path.join(root, rel)));
}

const serviceFiles = files.filter((f) => f.startsWith('src/api/services/'));
for (const rel of serviceFiles) {
  const src = read(rel);
  check(`${rel} uses shared api client`, /from ['"]\.\.\/client['"]/.test(src), 'no direct fetch/axios expected');
  check(`${rel} has no raw axios import`, !/from ['"]axios['"]/.test(src));
}

const routes = read('src/config/routes.js');
for (const role of ['admin', 'doctor', 'patient']) {
  check(`Protected route namespace exists: ${role}`, new RegExp(`^\\s*${role}:\\s*\\{`, 'm').test(routes));
}

const navigation = read('src/config/navigation.js');
for (const role of ['admin', 'doctor', 'patient']) {
  check(`Navigation namespace exists: ${role}`, new RegExp(`^\\s*${role}:\\s*\\[`, 'm').test(navigation));
}

const realtime = read('src/config/realtimeEvents.js');
const requiredEvents = [
  'appointment_created', 'appointment_updated', 'appointment_completed',
  'appointment_rescheduled', 'appointment_cancelled',
  'sos_created', 'sos_updated', 'sos_resolved',
  'doctor_duty_updated', 'recovery_updated', 'care_episode_completed',
  'medicine_updated', 'file_uploaded', 'note_updated',
  'restriction_updated', 'clinical_record_updated'
];
for (const event of requiredEvents) {
  check(`Realtime event contract: ${event}`, realtime.includes(`'${event}'`));
}

const rt = read('src/context/RealtimeContext.jsx');
check('RealtimeContext exposes subscribe()', /const subscribe = useCallback/.test(rt));
check('RealtimeContext exposes joinThread()', /const joinThread = useCallback/.test(rt));
check('RealtimeContext exposes leaveThread()', /const leaveThread = useCallback/.test(rt));
check('RealtimeContext exposes publish()', /const publish = useCallback/.test(rt));
check('RealtimeContext handles browser offline state', /offline/i.test(rt));
check('RealtimeContext handles browser online state', /online/i.test(rt));

const pages = fs.readdirSync(path.join(root, 'src/pages'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .flatMap((dir) => fs.readdirSync(path.join(root, 'src/pages', dir.name), { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(jsx|js)$/.test(e.name))
    .map((e) => path.join('src/pages', dir.name, e.name)));

for (const rel of pages) {
  const src = read(rel);
  check(`No direct fetch() in page: ${rel}`, !/\bfetch\s*\(/.test(src));
  check(`No direct axios import in page: ${rel}`, !/from ['"]axios['"]/.test(src));
}

const app = read('src/App.jsx');
check('App imports all three role route groups indirectly through config', /routes|navigation/i.test(app));
check('AuthContext exists', fs.existsSync(path.join(root, 'src/context/AuthContext.jsx')));
check('Patient emergency chat service exists', /emergency-chat/.test(read('src/api/services/patient.js')));
check('Doctor Priority Inbox service exists', /\/doctor\/inbox/.test(read('src/api/services/doctor.js')));
check('Admin SOS service exists', /sos-escalations/.test(read('src/api/services/admin.js')));

console.log(`CASTERLYCARE — PHASE 2.14.1 INTEGRATION CHECK`);
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);
for (const line of results) console.log(line);
process.exitCode = fail ? 1 : 0;
