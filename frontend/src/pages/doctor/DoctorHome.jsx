import { doctorService } from '../../api/services/doctor';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DoctorDashboardShell as DashboardShell } from '../../components/RoleDashboardShell';
import { Alert, Panel, Badge, Button, EmptyState, LoadingState } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import { APPOINTMENT_REALTIME_EVENTS, RECOVERY_REALTIME_EVENTS } from '../../config/realtimeEvents';

function safeText(value, fallback = 'Not recorded') {
  return value === null || value === undefined || String(value).trim() === '' ? fallback : String(value);
}

export default function DoctorHome() {
  const { user } = useAuth();
  const { subscribe } = useRealtime();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [acknowledgingId, setAcknowledgingId] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  async function load({ background = false } = {}) {
    if (!background) setRefreshing(true);
    try {
      const res = await doctorService.getHome();
      setData(res.data);
      setLoadError('');
    } catch (error) {
      if (!data) setLoadError(error?.message || 'Unable to load the doctor dashboard.');
      else setActionMessage(error?.message || 'The dashboard could not be refreshed. Showing the latest available data.');
    } finally {
      if (!background) setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(() => load({ background: true }), 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const cleanups = APPOINTMENT_REALTIME_EVENTS.map((eventName) =>
      subscribe(eventName, () => load({ background: true })),
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [subscribe]);

  useEffect(() => {
    const cleanups = RECOVERY_REALTIME_EVENTS.map((eventName) =>
      subscribe(eventName, () => load({ background: true })),
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [subscribe]);

  async function acknowledge(alertId, patientId) {
    if (acknowledgingId) return;
    setAcknowledgingId(alertId);
    setActionMessage('');
    try {
      await doctorService.acknowledgeSos(alertId);
      setActionMessage('SOS acknowledged. Opening the patient file.');
      navigate(`/doctor/patients/${patientId}`);
    } catch (error) {
      setActionMessage(error?.message || 'The SOS could not be acknowledged. Please try again.');
    } finally {
      setAcknowledgingId('');
    }
  }

  async function completeAppt(id) {
    try {
      await doctorService.completeAppointment(id);
      await load({ background: true });
      setActionMessage('Appointment marked as completed.');
    } catch (error) {
      setActionMessage(error?.message || 'The appointment could not be marked as completed.');
    }
  }

  const sosCount = data?.sosAlerts?.length || 0;
  const appointmentCount = data?.todaysAppointments?.length || 0;
  const completedToday = useMemo(
    () => data?.todaysAppointments?.filter((appointment) => appointment.status === 'completed').length || 0,
    [data],
  );

  return (
    <DashboardShell>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <p className="eyebrow mb-2">Doctor command centre</p>
          <h1 className="font-display text-3xl text-[var(--color-ink)] mb-1">Welcome, {safeText(user?.name, 'Doctor')}</h1>
          <p className="text-[var(--color-text-soft)]">Here is what needs your attention today.</p>
        </div>
        <Button variant="outline" onClick={() => load()} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh dashboard'}
        </Button>
      </div>

      {actionMessage && (
        <div className="mb-6" role="status" aria-live="polite">
          <Alert tone="neutral" title="Dashboard update">{actionMessage}</Alert>
        </div>
      )}

      {loadError && !data ? (
        <Panel title="Dashboard unavailable" className="mb-6">
          <Alert tone="danger" title="Unable to load your dashboard">{loadError}</Alert>
          <div className="mt-4">
            <Button variant="primary" onClick={() => load()} disabled={refreshing}>
              {refreshing ? 'Retrying…' : 'Retry'}
            </Button>
          </div>
        </Panel>
      ) : !data ? (
        <LoadingState title="Loading your clinical dashboard" subtitle="Checking urgent alerts and today’s appointments." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="stat-card">
              <span className="stat-card__label">Urgent SOS</span>
              <strong className="stat-card__value">{sosCount}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">Today’s appointments</span>
              <strong className="stat-card__value">{appointmentCount}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">Completed today</span>
              <strong className="stat-card__value">{completedToday}</strong>
            </div>
          </div>

          <Panel title="Emergency SOS" description="Urgent patient alerts requiring acknowledgement are shown here first.">
            {sosCount === 0 ? (
              <EmptyState title="No active emergencies" subtitle="You’ll see patient SOS alerts here the moment they come in." />
            ) : (
              <div className="space-y-3" aria-live="polite">
                {data.sosAlerts.map((alert) => {
                  const busy = acknowledgingId === alert.id;
                  return (
                    <article key={alert.id} className="flex flex-col gap-4 rounded-md border status-surface-critical p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge variant="critical">Urgent SOS</Badge>
                          <span className="text-xs text-[var(--color-text-soft)]">Immediate doctor acknowledgement</span>
                        </div>
                        <p className="font-semibold text-[var(--color-ink)]">{safeText(alert.patientName)}</p>
                        <p className="text-sm text-[var(--color-text-soft)]">
                          Surgery: {safeText(alert.surgery)} · Blood group: {safeText(alert.bloodGroup)}
                        </p>
                      </div>
                      <Button
                        variant="danger"
                        onClick={() => acknowledge(alert.id, alert.patientId)}
                        disabled={Boolean(acknowledgingId)}
                        aria-label={`Acknowledge SOS for ${safeText(alert.patientName)}`}
                      >
                        {busy ? 'Acknowledging…' : 'Acknowledge & open patient'}
                      </Button>
                    </article>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title="Today’s Appointments" description="Scheduled visits for the current day.">
            {data.todaysAppointments.length === 0 ? (
              <EmptyState title="No appointments scheduled for today" subtitle="Your schedule is clear for now." />
            ) : (
              <div className="space-y-3">
                {data.todaysAppointments.map((appointment) => (
                  <article key={appointment.id} className="flex flex-col gap-4 rounded-md border border-[var(--color-line)] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <Badge variant="gold">{safeText(appointment.time)}</Badge>
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--color-ink)]">{safeText(appointment.patientName)}</p>
                        <p className="text-sm text-[var(--color-text-soft)]">
                          Surgery: {safeText(appointment.surgery)} · Blood group: {safeText(appointment.bloodGroup)}
                        </p>
                        <p className="mt-1 text-sm text-[var(--color-text-soft)]">
                          {safeText(appointment.visitCategory)} · {safeText(appointment.serviceType)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <Button variant="outline" onClick={() => navigate(`/doctor/patients/${appointment.patientId}`)}>Patient details</Button>
                      <Button
                        variant="gold"
                        onClick={() => completeAppt(appointment.id)}
                        disabled={appointment.status === 'completed'}
                      >
                        {appointment.status === 'completed' ? 'Completed' : 'Appointment completed'}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
    </DashboardShell>
  );
}
