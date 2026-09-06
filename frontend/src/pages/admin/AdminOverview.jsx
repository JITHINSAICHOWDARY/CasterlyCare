import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminService } from '../../api/services/admin';
import { apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import {
  APPOINTMENT_REALTIME_EVENTS,
  RECOVERY_REALTIME_EVENTS,
} from '../../config/realtimeEvents';
import { AdminDashboardShell as DashboardShell } from '../../components/RoleDashboardShell';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  LoadingState,
  PageHeader,
  Panel,
  StatCard,
} from '../../components/ui';

function formatRelativeOrDate(value) {
  if (!value) return 'Not recorded';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not recorded';
  }

  return date.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function QuickAction({ to, icon, title, detail }) {
  return (
    <Link to={to} className="admin-quick-action panel-hover">
      <span className="admin-quick-action-icon" aria-hidden="true">
        {icon}
      </span>

      <span className="min-w-0">
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>

      <span aria-hidden="true">→</span>
    </Link>
  );
}

function normalizeDoctors(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(value?.doctors)) {
    return value.doctors;
  }

  if (Array.isArray(value?.data)) {
    return value.data;
  }

  return [];
}

function normalizeAppointments(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(value?.appointments)) {
    return value.appointments;
  }

  if (Array.isArray(value?.data)) {
    return value.data;
  }

  return [];
}

function normalizeEscalations(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(value?.escalations)) {
    return value.escalations;
  }

  if (Array.isArray(value?.data)) {
    return value.data;
  }

  return [];
}

function isDoctorActive(doctor) {
  return doctor?.isActive === true || doctor?.isActive === 1;
}

export default function AdminOverview() {
  const { user } = useAuth();
  const { subscribe } = useRealtime();

  const [stats, setStats] = useState(null);
  const [doctors, setDoctors] = useState(null);
  const [appointments, setAppointments] = useState(null);
  const [escalations, setEscalations] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadDashboard = useCallback(async ({ background = false } = {}) => {
    setError('');

    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    const results = await Promise.allSettled([
      adminService.getStats(),
      adminService.getDoctors(),
      adminService.getAppointments(),
      adminService.getEscalations(),
    ]);

    const failures = [];

    const [
      statsResult,
      doctorsResult,
      appointmentsResult,
      escalationsResult,
    ] = results;

    if (statsResult.status === 'fulfilled') {
      const responseData = statsResult.value?.data;

      setStats(responseData || {});
    } else {
      failures.push(
        `dashboard statistics: ${apiErrorMessage(statsResult.reason)}`,
      );
    }

    if (doctorsResult.status === 'fulfilled') {
      const responseData = doctorsResult.value?.data;
      const normalizedDoctors = normalizeDoctors(responseData);

      setDoctors(normalizedDoctors);
    } else {
      failures.push(
        `doctor list: ${apiErrorMessage(doctorsResult.reason)}`,
      );
    }

    if (appointmentsResult.status === 'fulfilled') {
      const responseData = appointmentsResult.value?.data;
      const normalizedAppointments = normalizeAppointments(responseData);

      setAppointments(normalizedAppointments);
    } else {
      failures.push(
        `appointment calendar: ${apiErrorMessage(
          appointmentsResult.reason,
        )}`,
      );
    }

    if (escalationsResult.status === 'fulfilled') {
      const responseData = escalationsResult.value?.data;
      const normalizedEscalations = normalizeEscalations(responseData);

      setEscalations(normalizedEscalations);
    } else {
      failures.push(
        `SOS escalation queue: ${apiErrorMessage(
          escalationsResult.reason,
        )}`,
      );
    }

    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);

    if (failures.length) {
      setError(
        `Some admin data could not be refreshed — ${failures.join(' • ')}`,
      );
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const cleanups = APPOINTMENT_REALTIME_EVENTS.map((eventName) =>
      subscribe(eventName, () => {
        loadDashboard({ background: true });
      }),
    );

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [subscribe, loadDashboard]);

  useEffect(() => {
    const cleanups = RECOVERY_REALTIME_EVENTS.map((eventName) =>
      subscribe(eventName, () => {
        loadDashboard({ background: true });
      }),
    );

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [subscribe, loadDashboard]);

  const activeDoctorCount = useMemo(
    () => (doctors || []).filter(isDoctorActive).length,
    [doctors],
  );

  const totalDoctorCount = useMemo(
    () => (doctors || []).length,
    [doctors],
  );

  const activeDoctors = useMemo(
    () =>
      (doctors || [])
        .filter(isDoctorActive)
        .slice(0, 5),
    [doctors],
  );

  const metrics = useMemo(
    () => ({
      activeDoctors:
        doctors !== null
          ? activeDoctorCount
          : Number(stats?.activeDoctors ?? stats?.totalDoctors ?? 0),

      totalDoctors:
        doctors !== null
          ? totalDoctorCount
          : Number(stats?.totalDoctors ?? 0),

      totalPatients: Number(stats?.totalPatients ?? 0),

      activeRecoveries: Number(stats?.activeSurgeries ?? 0),

      pendingEscalations:
        stats?.pendingEscalations != null
          ? Number(stats.pendingEscalations)
          : (escalations || []).length,
    }),
    [
      doctors,
      activeDoctorCount,
      totalDoctorCount,
      stats,
      escalations,
    ],
  );

  const upcomingAppointments = useMemo(() => {
    const now = new Date();

    return (appointments || [])
      .filter((appointment) => appointment?.status === 'upcoming')
      .filter((appointment) => {
        const timestamp = new Date(
          `${appointment?.date || ''}T${appointment?.time || '00:00'}`,
        );

        if (Number.isNaN(timestamp.getTime())) {
          return true;
        }

        return timestamp >= now;
      })
      .sort((a, b) =>
        `${a?.date || ''} ${a?.time || ''}`.localeCompare(
          `${b?.date || ''} ${b?.time || ''}`,
        ),
      )
      .slice(0, 5);
  }, [appointments]);

  const urgentEscalations = useMemo(
    () => (escalations || []).slice(0, 3),
    [escalations],
  );

  return (
    <DashboardShell>
      <div className="admin-overview-page">
        <PageHeader
          eyebrow="Command centre"
          title={`Welcome, ${user?.name || 'Administrator'}`}
          subtitle="A clear operational view of doctors, patients, schedules, and emergency escalations."
          action={(
            <Button
              variant="outline"
              onClick={() => loadDashboard({ background: true })}
              loading={refreshing}
            >
              Refresh dashboard
            </Button>
          )}
        />

        {error ? (
          <div className="mb-6" aria-live="assertive">
            <Alert
              variant="warning"
              title="Some information needs attention"
            >
              {error}
            </Alert>
          </div>
        ) : null}

        {loading &&
        !stats &&
        !doctors &&
        !appointments &&
        !escalations ? (
          <LoadingState label="Loading the administration dashboard…" />
        ) : (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
              <StatCard
                label="Active Doctors"
                value={metrics.activeDoctors}
                detail={`${metrics.totalDoctors} doctor account${metrics.totalDoctors === 1 ? '' : 's'} in system`}
                accent="crimson"
                icon="⚕"
              />

              <StatCard
                label="Active Patients"
                value={metrics.totalPatients}
                detail="Current patient accounts"
                accent="gold"
                icon="♙"
              />

              <StatCard
                label="Ongoing Recoveries"
                value={metrics.activeRecoveries}
                detail="Active recovery episodes"
                accent="forest"
                icon="◌"
              />

              <StatCard
                label="SOS Escalations"
                value={metrics.pendingEscalations}
                detail="Alerts requiring admin action"
                accent="danger"
                icon="⚠"
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6 mb-6">
              <Panel
                title="Operational actions"
                subtitle="Move directly to the areas that need administration."
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <QuickAction
                    to="/admin/doctors"
                    icon="⚕"
                    title="Manage doctors"
                    detail="Create, review, activate, or deactivate clinician accounts."
                  />

                  <QuickAction
                    to="/admin/appointments"
                    icon="▤"
                    title="Master calendar"
                    detail="Review schedules and resolve clashes across the facility."
                  />

                  <QuickAction
                    to="/admin/escalations"
                    icon="⚠"
                    title="Emergency escalations"
                    detail="Act on SOS alerts routed to administration."
                  />

                  <QuickAction
                    to="/admin/doctors"
                    icon="+"
                    title="Add a doctor"
                    detail="Create a new clinician account and unique Doctor ID."
                  />
                </div>
              </Panel>

              <Panel
                title="System status"
                subtitle="Latest successful dashboard refresh."
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-[var(--color-text-soft)]">
                      Dashboard connection
                    </span>

                    <Badge variant={error ? 'amber' : 'forest'}>
                      {error ? 'Partial data' : 'Operational'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-[var(--color-text-soft)]">
                      Last updated
                    </span>

                    <span className="text-sm font-semibold text-[var(--color-ink)]">
                      {formatRelativeOrDate(lastUpdated)}
                    </span>
                  </div>

                  <p className="text-xs text-[var(--color-muted)]">
                    Administrative actions are permission-controlled and
                    preserve underlying clinical records.
                  </p>
                </div>
              </Panel>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Panel
                title="Upcoming facility schedule"
                subtitle="The next upcoming appointments across all doctors."
              >
                {appointments === null ? (
                  <LoadingState label="Loading appointments…" />
                ) : upcomingAppointments.length === 0 ? (
                  <EmptyState
                    title="No upcoming appointments"
                    subtitle="The master calendar has no future appointments to display right now."
                    action={(
                      <Link
                        to="/admin/appointments"
                        className="btn btn-outline"
                      >
                        Open master calendar
                      </Link>
                    )}
                  />
                ) : (
                  <div className="space-y-3">
                    {upcomingAppointments.map((appointment) => (
                      <div
                        key={appointment.id}
                        className={`admin-list-item ${
                          appointment.isClash
                            ? 'admin-list-item-critical'
                            : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-[var(--color-ink)]">
                            {appointment.patientName || 'Patient'}
                          </p>

                          <p className="text-sm text-[var(--color-text-soft)]">
                            {appointment.doctorName || 'Doctor'} ·{' '}
                            {appointment.serviceType ||
                              appointment.visitCategory ||
                              'Appointment'}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-[var(--color-ink)]">
                            {appointment.date}
                          </p>

                          <p className="text-xs text-[var(--color-text-soft)]">
                            {appointment.time || 'Time not recorded'}
                          </p>

                          {appointment.isClash ? (
                            <Badge
                              variant="danger"
                              className="mt-1"
                            >
                              Clash
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    ))}

                    <div className="pt-2">
                      <Link
                        to="/admin/appointments"
                        className="text-sm font-semibold text-[var(--color-crimson)] hover:underline"
                      >
                        View master calendar →
                      </Link>
                    </div>
                  </div>
                )}
              </Panel>

              <Panel
                title="Active clinical team"
                subtitle="Currently active doctor accounts and duty state."
              >
                {doctors === null ? (
                  <LoadingState label="Loading doctors…" />
                ) : activeDoctors.length === 0 ? (
                  <EmptyState
                    title="No active doctors"
                    subtitle="Create or reactivate a doctor account to populate the clinical team."
                    action={(
                      <Link
                        to="/admin/doctors"
                        className="btn btn-primary"
                      >
                        Manage doctors
                      </Link>
                    )}
                  />
                ) : (
                  <div className="space-y-3">
                    {activeDoctors.map((doctor) => (
                      <div
                        key={doctor.id}
                        className="admin-list-item"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-[var(--color-ink)] truncate">
                            {doctor.name || 'Doctor'}
                          </p>

                          <p className="text-sm text-[var(--color-text-soft)] truncate">
                            {doctor.specialization ||
                              'Specialization not recorded'}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <Badge
                            variant={
                              doctor.dutyStatus === 'on_duty'
                                ? 'forest'
                                : 'amber'
                            }
                          >
                            {doctor.dutyStatus === 'on_duty'
                              ? 'On Duty'
                              : 'Off Duty'}
                          </Badge>

                          <p className="text-xs text-[var(--color-muted)] mt-1">
                            {doctor.uniqueDoctorId ||
                              'ID not recorded'}
                          </p>
                        </div>
                      </div>
                    ))}

                    <div className="pt-2">
                      <Link
                        to="/admin/doctors"
                        className="text-sm font-semibold text-[var(--color-crimson)] hover:underline"
                      >
                        View all doctors →
                      </Link>
                    </div>
                  </div>
                )}
              </Panel>

              <Panel
                title="Emergency escalations"
                subtitle="Off-duty doctor SOS alerts requiring administration."
              >
                {escalations === null ? (
                  <LoadingState label="Loading escalations…" />
                ) : urgentEscalations.length === 0 ? (
                  <EmptyState
                    title="No active escalations"
                    subtitle="No emergency SOS alert is currently awaiting admin action."
                    action={(
                      <Link
                        to="/admin/escalations"
                        className="btn btn-outline"
                      >
                        Open escalation queue
                      </Link>
                    )}
                  />
                ) : (
                  <div className="space-y-3">
                    {urgentEscalations.map((escalation) => (
                      <div
                        key={escalation.id}
                        className="admin-list-item admin-list-item-critical"
                      >
                        <div className="min-w-0">
                          <div className="mb-1">
                            <Badge variant="danger">
                              Emergency
                            </Badge>
                          </div>

                          <p className="font-semibold text-[var(--color-ink)]">
                            {escalation.patientNameSnapshot ||
                              'Patient'}
                          </p>

                          <p className="text-sm text-[var(--color-text-soft)]">
                            {escalation.surgerySnapshot ||
                              'Surgery not recorded'}{' '}
                            · Blood group{' '}
                            {escalation.bloodGroupSnapshot ||
                              'Not recorded'}
                          </p>
                        </div>

                        <Link
                          to="/admin/escalations"
                          className="btn btn-danger btn-sm shrink-0"
                        >
                          Review
                        </Link>
                      </div>
                    ))}

                    <div className="pt-2">
                      <Link
                        to="/admin/escalations"
                        className="text-sm font-semibold text-[var(--color-crimson)] hover:underline"
                      >
                        Open emergency queue →
                      </Link>
                    </div>
                  </div>
                )}
              </Panel>

              <Panel
                title="Administration principles"
                subtitle="Keep the command centre simple and controlled."
              >
                <div className="space-y-3 text-sm text-[var(--color-text-soft)]">
                  <p>
                    <strong className="text-[var(--color-ink)]">
                      Doctor access:
                    </strong>{' '}
                    Admin-created accounts can be activated or deactivated
                    without deleting historical records.
                  </p>

                  <p>
                    <strong className="text-[var(--color-ink)]">
                      Scheduling:
                    </strong>{' '}
                    The master calendar is the administrative place to
                    review facility-wide appointment clashes.
                  </p>

                  <p>
                    <strong className="text-[var(--color-ink)]">
                      Emergency routing:
                    </strong>{' '}
                    SOS alerts from off-duty doctors arrive here for direct
                    administrative action.
                  </p>
                </div>
              </Panel>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}