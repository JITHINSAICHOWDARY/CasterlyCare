import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { roleHome } from './config/navigation';

import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';

import AdminOverview from './pages/admin/AdminOverview';
import AdminDoctors from './pages/admin/AdminDoctors';
import AdminAppointments from './pages/admin/AdminAppointments';
import AdminEscalations from './pages/admin/AdminEscalations';

import DoctorHome from './pages/doctor/DoctorHome';
import DoctorProfile from './pages/doctor/DoctorProfile';
import DoctorPatients from './pages/doctor/DoctorPatients';
import DoctorPatientDetails from './pages/doctor/DoctorPatientDetails';
import DoctorAppointments from './pages/doctor/DoctorAppointments';
import DoctorInbox from './pages/doctor/DoctorInbox';

import PatientHome from './pages/patient/PatientHome';
import PatientProfile from './pages/patient/PatientProfile';
import PatientLabReports from './pages/patient/PatientLabReports';
import PatientAppointments from './pages/patient/PatientAppointments';
import PatientDiet from './pages/patient/PatientDiet';
import PatientMedicines from './pages/patient/PatientMedicines';
import PatientAssessment from './pages/patient/PatientAssessment';

function RootRedirect() {
  const { user, initializing } = useAuth();
  if (initializing) return null;
  return <Navigate to={user ? (roleHome[user.role] || '/login') : '/login'} replace />;
}

function PublicOnlyRoute({ children }) {
  const { user, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return null;
  if (user) {
    return <Navigate to={roleHome[user.role] || '/login'} replace state={{ from: location.pathname }} />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
      <Route path="/signup" element={<PublicOnlyRoute><Signup /></PublicOnlyRoute>} />

      <Route element={<ProtectedRoute role="admin" />}>
        <Route path="/admin" element={<AdminOverview />} />
        <Route path="/admin/doctors" element={<AdminDoctors />} />
        <Route path="/admin/appointments" element={<AdminAppointments />} />
        <Route path="/admin/escalations" element={<AdminEscalations />} />
      </Route>

      <Route element={<ProtectedRoute role="doctor" />}>
        <Route path="/doctor" element={<DoctorHome />} />
        <Route path="/doctor/profile" element={<DoctorProfile />} />
        <Route path="/doctor/patients" element={<DoctorPatients />} />
        <Route path="/doctor/patients/:patientId" element={<DoctorPatientDetails />} />
        <Route path="/doctor/appointments" element={<DoctorAppointments />} />
        <Route path="/doctor/inbox" element={<DoctorInbox />} />
      </Route>

      <Route element={<ProtectedRoute role="patient" />}>
        <Route path="/patient" element={<PatientHome />} />
        <Route path="/patient/profile" element={<PatientProfile />} />
        <Route path="/patient/lab-reports" element={<PatientLabReports />} />
        <Route path="/patient/appointments" element={<PatientAppointments />} />
        <Route path="/patient/diet" element={<PatientDiet />} />
        <Route path="/patient/medicines" element={<PatientMedicines />} />
        <Route path="/patient/assessment" element={<PatientAssessment />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
