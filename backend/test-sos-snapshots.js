const BASE = 'http://localhost:5050/api';

const readline = require('readline');

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function login(email, password) {
  const response = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Login failed for ${email}: ${data.message || response.status}`
    );
  }

  return data.token;
}

async function request(path, token, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `${options.method || 'GET'} ${path} failed (${response.status}): ${
        data.message || JSON.stringify(data)
      }`
    );
  }

  return data;
}

(async () => {
  try {
    console.log('\n=== 1.8.23 SOS SNAPSHOT VERIFICATION ===\n');

    const doctorEmail = await ask(
      'Doctor email [mynenijithinsai6@gmail.com]: '
    );
    const doctorPassword = await ask('Doctor password: ');

    const patientEmail = await ask(
      'Patient email [vishwanath@gmail.com]: '
    );
    const patientPassword = await ask('Patient password: ');

    const adminEmail = await ask(
      'Admin email [admin@lannistercare.com]: '
    );
    const adminPassword = await ask('Admin password: ');

    console.log('\nLogging in...');

    const doctorToken = await login(
      doctorEmail || 'mynenijithinsai6@gmail.com',
      doctorPassword
    );

    const patientToken = await login(
      patientEmail || 'vishwanath@gmail.com',
      patientPassword
    );

    const adminToken = await login(
      adminEmail || 'admin@lannistercare.com',
      adminPassword
    );

    console.log('✓ All three logins successful');

    console.log('\nPutting doctor OFF duty...');

    const dutyOff = await request(
      '/doctor/profile/duty-status',
      doctorToken,
      {
        method: 'PATCH',
        body: JSON.stringify({
          dutyStatus: 'off_duty',
        }),
      }
    );

    console.log('✓ Doctor is OFF duty');
    console.log(dutyOff);

    console.log('\nCreating fresh SOS...');

    const sos = await request(
      '/patient/sos',
      patientToken,
      {
        method: 'POST',
      }
    );

    console.log('✓ SOS created');

    const createdAlert = sos.alert || sos;

    console.log('Alert ID:', createdAlert.id);
    console.log('Status:', createdAlert.status);
    console.log(
      'Patient snapshot:',
      createdAlert.patientNameSnapshot
    );
    console.log(
      'Surgery snapshot:',
      createdAlert.surgerySnapshot
    );
    console.log(
      'Blood group snapshot:',
      createdAlert.bloodGroupSnapshot
    );

    console.log('\nChecking Admin escalation list...');

    const adminResponse = await request(
      '/admin/sos-escalations',
      adminToken
    );

    const alerts =
      Array.isArray(adminResponse)
        ? adminResponse
        : adminResponse.alerts || adminResponse.escalations || [];

    const adminAlert = alerts.find(
      (alert) => alert.id === createdAlert.id
    );

    if (!adminAlert) {
      throw new Error(
        'Fresh SOS was not found in the Admin escalation list.'
      );
    }

    console.log('\n=== ADMIN RESULT ===');
    console.log('Alert ID:', adminAlert.id);
    console.log('Status:', adminAlert.status);
    console.log('Patient:', adminAlert.patientNameSnapshot);
    console.log('Surgery:', adminAlert.surgerySnapshot);
    console.log('Blood Group:', adminAlert.bloodGroupSnapshot);

    const passed =
      adminAlert.status === 'escalated' &&
      !!adminAlert.patientNameSnapshot &&
      !!adminAlert.surgerySnapshot &&
      !!adminAlert.bloodGroupSnapshot;

    if (passed) {
      console.log(
        '\n✅ 1.8.23 PASSED — SOS snapshot data is correct.'
      );
    } else {
      console.log(
        '\n❌ 1.8.23 FAILED — snapshot data is missing or incorrect.'
      );
    }

    console.log('\nRestoring doctor ON duty...');

    await request(
      '/doctor/profile/duty-status',
      doctorToken,
      {
        method: 'PATCH',
        body: JSON.stringify({
          dutyStatus: 'on_duty',
        }),
      }
    );

    console.log('✓ Doctor restored to ON duty');
  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error(error.message);
    process.exit(1);
  }
})();
