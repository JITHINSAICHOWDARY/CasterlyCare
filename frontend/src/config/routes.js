import { roleHome } from './navigation';

export const publicRoutes = {
  login: '/login',
  signup: '/signup',
};

export const protectedRoutes = {
  admin: {
    root: roleHome.admin,
    doctors: '/admin/doctors',
    appointments: '/admin/appointments',
    escalations: '/admin/escalations',
  },
  doctor: {
    root: roleHome.doctor,
    profile: '/doctor/profile',
    patients: '/doctor/patients',
    patient: (patientId) => `/doctor/patients/${patientId}`,
    appointments: '/doctor/appointments',
    inbox: '/doctor/inbox',
  },
  patient: {
    root: roleHome.patient,
    profile: '/patient/profile',
    labReports: '/patient/lab-reports',
    appointments: '/patient/appointments',
    diet: '/patient/diet',
    medicines: '/patient/medicines',
    assessment: '/patient/assessment',
  },
};
