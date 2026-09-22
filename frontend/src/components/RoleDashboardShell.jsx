import DashboardShell from './DashboardShell';

export function AdminDashboardShell({ children }) {
  return <DashboardShell role="admin">{children}</DashboardShell>;
}

export function DoctorDashboardShell({ children }) {
  return <DashboardShell role="doctor">{children}</DashboardShell>;
}

export function PatientDashboardShell({ children }) {
  return (
    <DashboardShell role="patient" withPatientChat>
      <div className="patient-dashboard-content">{children}</div>
    </DashboardShell>
  );
}
