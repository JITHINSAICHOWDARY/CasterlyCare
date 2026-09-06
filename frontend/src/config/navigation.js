export const roleHome = {
  admin: '/admin',
  doctor: '/doctor',
  patient: '/patient',
};

export const navigationByRole = {
  admin: [
    { to: '/admin', label: 'Overview', icon: '◈', end: true },
    { to: '/admin/doctors', label: 'Manage Doctors', icon: '⚕' },
    { to: '/admin/appointments', label: 'Master Calendar', icon: '▤' },
    { to: '/admin/escalations', label: 'SOS Escalations', icon: '⚠' },
  ],
  doctor: [
    { to: '/doctor', label: 'Home', icon: '⌂', end: true },
    { to: '/doctor/profile', label: 'Profile', icon: '◉' },
    { to: '/doctor/patients', label: 'Patients', icon: '⚕' },
    { to: '/doctor/appointments', label: 'Appointments', icon: '▤' },
    { to: '/doctor/inbox', label: 'Priority Inbox', icon: '✉' },
  ],
  patient: [
    { to: '/patient', label: 'Home', icon: '⌂', end: true },
    { to: '/patient/profile', label: 'Profile', icon: '◉' },
    { to: '/patient/lab-reports', label: 'Lab Reports', icon: '⌗' },
    { to: '/patient/appointments', label: 'Appointments', icon: '▤' },
    { to: '/patient/diet', label: 'Diet Management', icon: '❖' },
    { to: '/patient/medicines', label: 'Medicines', icon: '⚕' },
    { to: '/patient/assessment', label: 'Assessment', icon: '♥' },
  ],
};

export const roleLabels = {
  admin: 'Administrator',
  doctor: 'Doctor',
  patient: 'Patient',
};
