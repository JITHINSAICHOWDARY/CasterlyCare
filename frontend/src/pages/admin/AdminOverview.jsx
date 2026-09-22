import NavIcon from '../../components/NavIcon';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminService } from '../../api/services/admin';
import { apiErrorMessage } from '../../api/client';
import { useRealtime } from '../../context/RealtimeContext';
import {
  APPOINTMENT_REALTIME_EVENTS,
  RECOVERY_REALTIME_EVENTS,
  REALTIME_EVENTS,
} from '../../config/realtimeEvents';
import { AdminDashboardShell as DashboardShell } from '../../components/RoleDashboardShell';
import {
  Alert,
  Button,
  LoadingState,
  PageHeader,
  Panel,
  Skeleton,
  StatCard,
} from '../../components/ui';

function shortDate(value) {
  const date = new Date(`${value || ''}T00:00`);
  return Number.isNaN(date.getTime())
    ? value || '—'
    : date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function normalizeDoctors(value) {
  const list = Array.isArray(value)
    ? value
    : Array.isArray(value?.doctors)
      ? value.doctors
      : Array.isArray(value?.data)
        ? value.data
        : [];

  // /admin/doctors nests these under doctorProfile; read that here once
  // rather than in every place that later touches a doctor record.
  return list.map((doctor) => ({
    ...doctor,
    uniqueDoctorId: doctor?.uniqueDoctorId || doctor?.doctorProfile?.uniqueDoctorId || null,
    specialization: doctor?.specialization || doctor?.doctorProfile?.specialization || null,
    dutyStatus: doctor?.dutyStatus || doctor?.doctorProfile?.dutyStatus || 'off_duty',
  }));
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
  const { subscribe } = useRealtime();

  const [stats, setStats] = useState(null);
  const [doctors, setDoctors] = useState(null);
  const [appointments, setAppointments] = useState(null);
  const [escalations, setEscalations] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async ({ background = false } = {}) => {
    setError('');

    if (!background) setLoading(true);

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

    setLoading(false);

    if (failures.length) {
      setError(
        failures.length === results.length
          ? "We can't reach the server right now. Check your connection and try again."
          : "Some of this information couldn't be loaded. Try again in a moment.",
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

  useEffect(
    () => subscribe(REALTIME_EVENTS.DOCTOR_DUTY_UPDATED, () => loadDashboard({ background: true })),
    [subscribe, loadDashboard],
  );

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
        .slice(0, 8),
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
      .slice(0, 8);
  }, [appointments]);

  const clashCount = useMemo(
    () => (appointments || []).filter((appointment) => appointment?.isClash).length,
    [appointments],
  );

  const escalationCount = metrics.pendingEscalations;
  const needsAttention = escalationCount > 0 || clashCount > 0;


  const noData = Boolean(error) && !stats && !doctors && !appointments && !escalations;
  const today = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <DashboardShell>
      <div className="admin-overview-page">
        <PageHeader title="Welcome, Admin" subtitle={today} />

        {error ? (
          <div className="mb-4" aria-live="assertive">
            <Alert variant="warning" title="Dashboard unavailable">
              <p className="mb-2">{error}</p>
              <Button variant="outline" size="sm" onClick={() => loadDashboard()}>
                Try again
              </Button>
            </Alert>
          </div>
        ) : null}

        {loading &&
        !stats &&
        !doctors &&
        !appointments &&
        !escalations ? (
          <div role="status" aria-live="polite">
            <span className="sr-only">Loading the administration dashboard…</span>
            <div className="admin-stats">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="skeleton-tile" />)}
            </div>
            <div className="admin-overview-panels">
              <Skeleton className="skeleton-panel" />
              <Skeleton className="skeleton-panel" />
            </div>
          </div>
        ) : (
          <>
            {needsAttention ? (
              <div className="admin-attention" role="alert">
                <p className="admin-attention-copy">
                  {escalationCount > 0 ? (
                    <strong>
                      {escalationCount} SOS escalation{escalationCount === 1 ? '' : 's'} need action
                    </strong>
                  ) : null}
                  {escalationCount > 0 && clashCount > 0 ? ' · ' : null}
                  {clashCount > 0 ? (
                    <strong>
                      {clashCount} schedule clash{clashCount === 1 ? '' : 'es'}
                    </strong>
                  ) : null}
                </p>

                <div className="admin-attention-links">
                  {escalationCount > 0 ? (
                    <Link to="/admin/escalations" className="btn btn-danger btn-sm">
                      Review SOS
                    </Link>
                  ) : null}
                  {clashCount > 0 ? (
                    <Link to="/admin/appointments" className="btn btn-outline btn-sm">
                      Resolve clashes
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="admin-stats">
              <StatCard label="Active doctors" icon={<NavIcon name="doctors" size={44} />} value={noData ? '—' : metrics.activeDoctors} accent="crimson" />
              <StatCard label="Active patients" icon={<NavIcon name="patients" size={44} />} value={noData ? '—' : metrics.totalPatients} accent="gold" />
              <StatCard label="Ongoing recoveries" icon={<NavIcon name="assessment" size={44} />} value={noData ? '—' : metrics.activeRecoveries} accent="forest" />
              <StatCard
                label="SOS escalations" icon={<NavIcon name="alert" size={44} />}
                value={noData ? '—' : metrics.pendingEscalations}
                accent={metrics.pendingEscalations > 0 ? 'danger' : 'sand'}
              />
            </div>

            <div className="admin-overview-panels">
              <Panel
                title="Upcoming appointments"
                action={<Link to="/admin/appointments" className="admin-link">View all</Link>}
              >
                <div className="admin-scroll">
                  {appointments === null ? (
                    error ? <p className="admin-empty">Unavailable.</p> : <LoadingState label="Loading appointments…" />
                  ) : upcomingAppointments.length === 0 ? (
                    <p className="admin-empty">No upcoming appointments.</p>
                  ) : (
                    upcomingAppointments.map((appointment) => (
                      <div key={appointment.id} className="admin-list-item">
                        <div className="min-w-0">
                          <p className="admin-row-title truncate">
                            {appointment.patientName || 'Patient'}
                          </p>
                          <p className="admin-row-sub truncate">
                            {appointment.doctorName || 'Doctor'} ·{' '}
                            {appointment.serviceType || appointment.visitCategory || 'Appointment'}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="admin-row-title">{shortDate(appointment.date)}</p>
                          <p className="admin-row-sub">
                            {appointment.time || '—'}
                            {appointment.isClash ? <span className="admin-clash"> · Clash</span> : null}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Panel>

              <Panel
                title="Clinical team"
                action={<Link to="/admin/doctors" className="admin-link">Manage</Link>}
              >
                <div className="admin-scroll">
                  {doctors === null ? (
                    error ? <p className="admin-empty">Unavailable.</p> : <LoadingState label="Loading doctors…" />
                  ) : activeDoctors.length === 0 ? (
                    <p className="admin-empty">No active doctors.</p>
                  ) : (
                    activeDoctors.map((doctor) => (
                      <div key={doctor.id} className="admin-list-item">
                        <div className="admin-list-item-main">
                          <span className="admin-avatar" aria-hidden="true">
                            {(doctor.name || 'D').trim()[0]}
                          </span>
                          <div className="min-w-0">
                            <p className="admin-row-title truncate">{doctor.name || 'Doctor'}</p>
                            {doctor.specialization ? (
                              <p className="admin-row-sub truncate">{doctor.specialization}</p>
                            ) : null}
                          </div>
                        </div>

                        <span className={`admin-duty ${doctor.dutyStatus === 'on_duty' ? 'is-on' : ''}`}>
                          {doctor.dutyStatus === 'on_duty' ? 'On duty' : 'Off duty'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </Panel>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
