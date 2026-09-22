export const roleHome = {
  admin: '/admin',
  doctor: '/doctor',
  patient: '/patient',
};

export const navigationByRole = {
  admin: [
    { to: '/admin', label: 'Overview', icon: 'overview', end: true },
    { to: '/admin/doctors', label: 'Manage Doctors', icon: 'doctors' },
    { to: '/admin/appointments', label: 'Master Calendar', icon: 'calendar' },
    { to: '/admin/escalations', label: 'SOS Escalations', icon: 'alert' },
    { to: '/admin/account', label: 'Account', icon: 'profile' },
  ],
  doctor: [
    { to: '/doctor', label: 'Home', icon: 'home', end: true },
    { to: '/doctor/profile', label: 'Profile', icon: 'profile' },
    { to: '/doctor/patients', label: 'Patients', icon: 'patients' },
    { to: '/doctor/appointments', label: 'Appointments', icon: 'calendar' },
    { to: '/doctor/inbox', label: 'Priority Inbox', icon: 'inbox' },
  ],
  patient: [
    { to: '/patient', label: 'Home', icon: 'home', end: true },
    { to: '/patient/profile', label: 'Profile', icon: 'profile' },
    { to: '/patient/lab-reports', label: 'Lab Reports', icon: 'labs' },
    { to: '/patient/appointments', label: 'Appointments', icon: 'calendar' },
    { to: '/patient/diet', label: 'Diet Management', icon: 'diet' },
    { to: '/patient/medicines', label: 'Medicines', icon: 'medicines' },
    { to: '/patient/assessment', label: 'Assessment', icon: 'assessment' },
    { to: '/patient/new-episode', label: 'New Recovery', icon: 'plus' },
  ],
};

export const roleLabels = {
  admin: 'Administrator',
  doctor: 'Doctor',
  patient: 'Patient',
};
