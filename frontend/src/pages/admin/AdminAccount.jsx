import { AdminDashboardShell as DashboardShell } from '../../components/RoleDashboardShell';
import { Panel, PageHeader } from '../../components/ui';
import ChangePasswordCard from '../../components/ChangePasswordCard';
import { useAuth } from '../../context/AuthContext';

export default function AdminAccount() {
  const { user } = useAuth();

  return (
    <DashboardShell>
      <div className="admin-account-page">
        <PageHeader title="Account" />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <Panel title="Your account" className="lg:col-span-1">
            <dl className="account-list">
              <div><dt>Name</dt><dd>{user?.name || 'Administrator'}</dd></div>
              <div><dt>Email</dt><dd className="break-words">{user?.email || 'Not recorded'}</dd></div>
              <div><dt>Role</dt><dd>Administrator</dd></div>
            </dl>
          </Panel>

          <div className="lg:col-span-2">
            <ChangePasswordCard />
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
