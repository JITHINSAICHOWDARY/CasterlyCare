import { PatientDashboardShell as RolePatientShell } from './RoleDashboardShell';

export default function PatientDashboardShell({ children }) {
  return <div className="patient-dashboard-content"><RolePatientShell>{children}</RolePatientShell></div>;
}
