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

const realtimeContext = read('src/context/RealtimeContext.jsx');
const socket = read('src/api/socket.js');
const client = read('src/api/client.js');
const patientChat = read('src/components/PatientChatWidget.jsx');
const doctorInbox = read('src/pages/doctor/DoctorInbox.jsx');
const realtime = read('src/config/realtimeEvents.js');
const packageJson = JSON.parse(read('package.json'));

for (const [name, text] of [
  ['RealtimeContext.jsx', realtimeContext],
  ['socket.js', socket],
  ['client.js', client],
  ['PatientChatWidget.jsx', patientChat],
  ['DoctorInbox.jsx', doctorInbox],
  ['realtimeEvents.js', realtime],
]) {
  check(`${name} exists`, text.length > 0);
  check(`${name} balanced braces`, (text.match(/\{/g) || []).length === (text.match(/\}/g) || []).length);
  check(`${name} balanced parentheses`, (text.match(/\(/g) || []).length === (text.match(/\)/g) || []).length);
}

check('RealtimeContext listens for browser offline', /addEventListener\(['"]offline['"]/.test(realtimeContext));
check('RealtimeContext listens for browser online', /addEventListener\(['"]online['"]/.test(realtimeContext));
check('RealtimeContext transitions to offline', /setStatus\(['"]offline['"]\)/.test(realtimeContext));
check('RealtimeContext transitions to reconnecting', /setStatus\(['"]reconnecting['"]\)/.test(realtimeContext));
check('RealtimeContext disconnects socket offline', /socket\.disconnect\(\)/.test(realtimeContext));
check('RealtimeContext reconnects socket online', /socket\.connect\(\)/.test(realtimeContext));
check('RealtimeContext refreshes socket auth before reconnect', /socket\.auth\s*=\s*\{\s*token:\s*localStorage\.getItem\(TOKEN_KEY\)/.test(realtimeContext));
check('RealtimeContext rejoins tracked chat threads after connect', /joinedThreadsRef\.current\.forEach\(\(threadId\).*join_thread/s.test(realtimeContext));
check('RealtimeContext removes browser listeners during cleanup', /removeEventListener\(['"]offline['"]/.test(realtimeContext) && /removeEventListener\(['"]online['"]/.test(realtimeContext));
check('RealtimeContext removes realtime listeners during cleanup', /socket\.off\(['"]connect['"]/.test(realtimeContext) && /socket\.off\(['"]disconnect['"]/.test(realtimeContext));

check('socket uses token callback authentication', /auth:\s*\(cb\)\s*=>\s*cb\(\{\s*token:\s*currentToken\(\)\s*\}\)/.test(socket));
check('socket refreshes auth before connect', /instance\.auth\s*=\s*\{\s*token:\s*currentToken\(\)\s*\}/.test(socket));
check('socket has websocket and polling fallback', /transports:\s*\[['"]websocket['"],\s*['"]polling['"]\]/.test(socket));
check('socket disconnect cleanup clears singleton', /socket\s*=\s*null/.test(socket));
check('client keeps a centralized token key', /export const TOKEN_KEY/.test(client));

check('Patient Emergency Chat exposes connection state', /status|isConnected|reconnecting|offline/i.test(patientChat));
check('Doctor Inbox exposes connection state', /status|isConnected|reconnecting|offline/i.test(doctorInbox));
check('Patient Emergency Chat keeps REST fallback', /patientService\.(get|send|start).*Chat|patientService/i.test(patientChat));
check('Doctor Inbox keeps REST fallback', /doctorService\.(get|send|close).*Chat|doctorService/i.test(doctorInbox));
check('Patient Emergency Chat avoids direct socket creation', !/io\(/.test(patientChat));
check('Doctor Inbox avoids direct socket creation', !/io\(/.test(doctorInbox));

for (const event of [
  'appointment_created', 'appointment_updated', 'appointment_completed', 'appointment_rescheduled', 'appointment_cancelled',
  'sos_created', 'sos_updated', 'sos_resolved', 'doctor_duty_updated',
  'recovery_updated', 'care_episode_completed', 'medicine_updated', 'file_uploaded', 'note_updated',
  'restriction_updated', 'clinical_record_updated',
]) {
  check(`realtime event contract: ${event}`, realtime.includes(event));
}

check('Package exposes integration baseline command', packageJson.scripts?.['test:integration'] === 'node scripts/phase2141-integration-check.mjs');
check('Package exposes security permission command', packageJson.scripts?.['test:security-permissions'] === 'node scripts/phase2146-security-permission-check.mjs');
check('Package exposes appointment contract command', packageJson.scripts?.['test:appointments'] === 'node scripts/phase2148-appointment-contract-check.mjs');

console.log('CASTERLYCARE — PHASE 2.14.9 REALTIME FAILURE-MODE CHECK');
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);
for (const line of results) console.log(line);
process.exitCode = fail ? 1 : 0;
