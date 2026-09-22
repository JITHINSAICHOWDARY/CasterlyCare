import { doctorService } from '../../api/services/doctor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DoctorDashboardShell as DashboardShell } from '../../components/RoleDashboardShell';
import { Alert, Panel, Badge, Button, ConfirmModal, EmptyState, LoadingState, PageHeader, StatCard } from '../../components/ui';
import NavIcon from '../../components/NavIcon';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import { APPOINTMENT_REALTIME_EVENTS, RECOVERY_REALTIME_EVENTS } from '../../config/realtimeEvents';
import { slotLabel } from '../../utils/time';
import GlassLensFilter from '../../components/GlassLensFilter';

function titleCase(value = '') {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function slotHasPassed(appointment) {
  const at = new Date(`${appointment.date}T${appointment.time}:00`);
  return Number.isNaN(at.getTime()) || at <= new Date();
}

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
  const [completeTarget, setCompleteTarget] = useState(null);

  const loadedOnce = useRef(false);

  const load = useCallback(async ({ background = false } = {}) => {
    if (!background) setRefreshing(true);
    try {
      const res = await doctorService.getHome();
      setData(res.data);
      loadedOnce.current = true;
      setLoadError('');
    } catch (error) {
      if (!loadedOnce.current) setLoadError(error?.message || 'Unable to load the doctor dashboard.');
      else setActionMessage(error?.message || 'The dashboard could not be refreshed. Showing the latest available data.');
    } finally {
      if (!background) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => load({ background: true }), 15000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const events = [...APPOINTMENT_REALTIME_EVENTS, ...RECOVERY_REALTIME_EVENTS];
    const cleanups = events.map((eventName) => subscribe(eventName, () => load({ background: true })));
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [subscribe, load]);

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
  // "Dr." always leads the name, without doubling it if the name already has one.
  const bareName = safeText(user?.name, '').replace(/^\s*dr\.?\s+/i, '').trim();
  const doctorName = bareName ? `Dr. ${bareName}` : 'Doctor';
  const today = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  const reviewCount = data?.needsReview?.length || 0;
  const completedToday = useMemo(
    () => data?.todaysAppointments?.filter((appointment) => appointment.status === 'completed').length || 0,
    [data],
  );

  return (
    <DashboardShell>
      <div className="doctor-home-page">
      <GlassLensFilter />
      <PageHeader title={`Welcome, ${doctorName}`} subtitle={today} />

      {actionMessage && (
        <div className="mb-6" role="status" aria-live="polite">
          <Alert variant="ink" title="Dashboard update">{actionMessage}</Alert>
        </div>
      )}

      {loadError && !data ? (
        <Panel title="Dashboard unavailable" className="mb-6">
          <Alert variant="danger" title="Unable to load your dashboard">{loadError}</Alert>
          <div className="mt-4">
            <Button variant="primary" onClick={() => load()} disabled={refreshing}>
              {refreshing ? 'Retrying…' : 'Retry'}
            </Button>
          </div>
        </Panel>
      ) : !data ? (
        <LoadingState label="Loading your clinical dashboard…" rows={4} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              label="Urgent SOS"
              icon={<NavIcon name="alert" size={44} />}
              value={sosCount}
              accent={sosCount > 0 ? 'danger' : 'crimson'}
            />
            <StatCard label="Today’s appointments" icon={<NavIcon name="calendar" size={44} />} value={appointmentCount} accent="gold" />
            <StatCard className="col-span-2 lg:col-span-1" label="Completed today" icon={<NavIcon name="check" size={44} />} value={completedToday} accent="forest" />
          </div>

          <Panel title="Emergency SOS">
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
                        </div>
                        <p className="font-semibold text-[var(--color-ink)]">{safeText(alert.patientName)}</p>
                        <p className="text-sm text-[var(--color-text-soft)]">
                          {[alert.surgery, alert.bloodGroup ? `Blood group ${alert.bloodGroup}` : ''].filter(Boolean).join(' · ') || 'Details not recorded'}
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

          {reviewCount > 0 ? (
            <Panel title="Needs clinical review">
              <div className="space-y-3">
                {data.needsReview.map((item) => (
                  <article key={item.patientId} className="flex flex-col gap-3 rounded-md border border-[var(--color-line)] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--color-ink)]">{safeText(item.patientName)}</p>
                      <p className="text-sm text-[var(--color-text-soft)]">
                        {safeText(item.surgery)} · {safeText(item.trendLabel)}
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => navigate(`/doctor/patients/${item.patientId}`)}>Open patient</Button>
                  </article>
                ))}
              </div>
            </Panel>
          ) : null}

          <Panel title="Today’s appointments" action={<Link to="/doctor/appointments" className="admin-link">View all</Link>}>
            {data.todaysAppointments.length === 0 ? (
              <EmptyState title="No appointments today" subtitle="Your schedule is clear for now." />
            ) : (
              <ul className="appt-rows">
                {data.todaysAppointments.map((appointment) => {
                  const passed = slotHasPassed(appointment);
                  return (
                    <li key={appointment.id} className="appt-row">
                      <div className="appt-time">{slotLabel(appointment.time)}</div>
                      <div className="appt-info">
                        <Link to={`/doctor/patients/${appointment.patientId}`} className="appt-patient">{safeText(appointment.patientName, 'Patient')}</Link>
                        <p className="appt-meta">
                          {[appointment.surgery, titleCase(safeText(appointment.visitCategory, '')), titleCase(safeText(appointment.serviceType, ''))].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <div className="appt-actions">
                        {appointment.status === 'completed' ? (
                          <Badge variant="forest">Completed</Badge>
                        ) : (
                          <>
                            <Button variant="primary" size="sm" onClick={() => setCompleteTarget(appointment)} disabled={!passed}>Mark completed</Button>
                            {!passed ? <span className="appt-hint">Available after {slotLabel(appointment.time)}</span> : null}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      )}
      </div>

      <ConfirmModal
        open={!!completeTarget}
        tone="info"
        variant="primary"
        eyebrow="Mark completed"
        title="Mark this appointment completed?"
        body={completeTarget ? `${safeText(completeTarget.patientName, 'This patient')}'s ${titleCase(safeText(completeTarget.serviceType, ''))} at ${slotLabel(completeTarget.time)} will be marked completed.` : ''}
        confirmLabel="Mark completed"
        onConfirm={async () => { const id = completeTarget.id; setCompleteTarget(null); await completeAppt(id); }}
        onCancel={() => setCompleteTarget(null)}
      />
    </DashboardShell>
  );
}
