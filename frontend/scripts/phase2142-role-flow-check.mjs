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
const protectedRoute = read('src/components/ProtectedRoute.jsx');
const auth = read('src/context/AuthContext.jsx');
const routes = read('src/config/routes.js');
const navigation = read('src/config/navigation.js');

const roleRoutes = {
  admin: ['/admin', '/admin/doctors', '/admin/appointments', '/admin/escalations'],
  doctor: ['/doctor', '/doctor/profile', '/doctor/patients', '/doctor/patients/:patientId', '/doctor/appointments', '/doctor/inbox'],
  patient: ['/patient', '/patient/profile', '/patient/lab-reports', '/patient/appointments', '/patient/diet', '/patient/medicines', '/patient/assessment'],
};

for (const [role, paths] of Object.entries(roleRoutes)) {
  check(`${role} protected route group exists`, new RegExp(`ProtectedRoute role=["']${role}["']`).test(app));
  for (const route of paths) {
    const escaped = route.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
    check(`${role} route registered: ${route}`, new RegExp(`path=["']${escaped}["']`).test(app));
  }
  check(`${role} role home configured`, navigation.includes(`{ to: '${paths[0]}'`));
  check(`${role} navigation entries cover route namespace`, navigation.includes(paths[0]));
}

check('Public login route exists', /path=["']\/login["']/.test(app));
check('Public signup route exists', /path=["']\/signup["']/.test(app));
check('Catch-all returns to root redirect', /path=["']\*["']\s+element={<Navigate to=["']\/["']/.test(app));
check('Unauthenticated protected users go to login', /Navigate to=["']\/login["'] replace state={{ from:/.test(protectedRoute));
check('Wrong-role protected access redirects to own role home', /Navigate to={roleHome\[user\.role\]/.test(protectedRoute));
check('Public routes redirect authenticated users to role home', /if \(user\)[\s\S]*Navigate to={roleHome\[user\.role\]/.test(app));
check('Root redirect sends authenticated users to role home', /Navigate to={user \? \(roleHome\[user\.role\] \|\| ["']\/login["']\)/.test(app));
check('Unknown role falls back to login', /roleHome\[user\.role\] \|\| ["']\/login["']/.test(app) && /\|\| ["']\/login["']/.test(protectedRoute));
check('Auth session stores token', /localStorage\.setItem\(TOKEN_KEY, data\.token\)/.test(auth));
check('Auth session stores user', /localStorage\.setItem\(USER_KEY, JSON\.stringify\(nextUser\)\)/.test(auth));
check('Logout clears token', /localStorage\.removeItem\(TOKEN_KEY\)/.test(auth));
check('Logout clears user', /localStorage\.removeItem\(USER_KEY\)/.test(auth));
check('Auth response validates role', /!data\?\.token \|\| !nextUser\?\.role/.test(auth));
check('Patient signup normalizes Doctor ID', /doctorUniqueId: payload\.doctorUniqueId\?\.trim\(\)\.toUpperCase\(\)/.test(auth));
check('No visible admin navigation control', !/label:\s*["']Admin["']/i.test(navigation));

for (const role of ['admin', 'doctor', 'patient']) {
  const groupMatch = app.match(new RegExp(`ProtectedRoute role=[\"']${role}[\"'] /?>?([\\s\\S]*?)(?=\n\s*<Route element={<ProtectedRoute role=|\n\s*<Route path=\"/\\*\")`));
  check(`${role} protected namespace appears in App`, app.includes(`path=\"/${role}`));
}
for (const [role, forbidden] of Object.entries({
  admin: ['/doctor', '/patient'],
  doctor: ['/admin', '/patient'],
  patient: ['/admin', '/doctor'],
})) {
  const start = app.indexOf(`ProtectedRoute role=\"${role}\"`);
  check(`${role} group starts at protected boundary`, start >= 0);
  if (start >= 0) {
    const next = app.indexOf('ProtectedRoute role=', start + 1);
    const group = app.slice(start, next > 0 ? next : app.length);
    for (const target of forbidden) check(`${role} group excludes ${target}`, !group.includes(`path=\"${target}`));
  }
}

console.log('CASTERLYCARE — PHASE 2.14.2 ROLE FLOW CHECK');
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);
for (const line of results) console.log(line);
process.exitCode = fail ? 1 : 0;
