import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PatientDashboardShell } from '../../components/RoleDashboardShell';
import {
  Alert,
  Badge,
  Button,
  ConfirmModal,
  EmptyState,
  LoadingState,
  Panel,
  PageHeader,
  RecoveryDonut,
  StatCard,
} from '../../components/ui';
import NavIcon from '../../components/NavIcon';
import GlassLensFilter from '../../components/GlassLensFilter';
import { patientService } from '../../api/services/patient';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import { APPOINTMENT_REALTIME_EVENTS, RECOVERY_REALTIME_EVENTS } from '../../config/realtimeEvents';

function formatVisitCategory(value) {
  return value === 'home_visit' ? 'Home Visit' : 'Hospital Visit';
}

function formatDoctorName(value) {
  const name = String(value || '').trim();
  if (!name) return 'Assigned doctor';
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
}

function formatServiceType(value) {
  return String(value || '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTime(value) {
  if (!value) return 'Time not set';
  const [hourText, minuteText] = String(value).split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return value;
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

function timeKey(value) {
  const [hourText, minuteText] = String(value || '').split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.MAX_SAFE_INTEGER;
  return hour * 60 + minute;
}

function getNextDoseIndex(medicines) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let best = null;
  medicines.forEach((medicine, medicineIndex) => {
    (medicine.times || []).forEach((time, timeIndex) => {
      const key = timeKey(time);
      if (key >= currentMinutes && (!best || key < best.key)) best = { medicineIndex, timeIndex, key };
    });
  });
  return best;
}

function formatDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  // Local date components, not toISOString (which converts to UTC and can
  // shift the date by a day depending on the browser's timezone offset).
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeRecovery(data, user) {
  const episode = data?.careEpisode || data?.activeCareEpisode || data?.recovery || {};
  const totalDays = Number(
    episode.expectedRecoveryDays
    ?? episode.recoveryTotalDays
    ?? data?.recoveryTotalDays
    ?? user?.recoveryTotalDays
    ?? 0,
  );
  const daysRemaining = Number(
    episode.daysRemaining
    ?? episode.recoveryDaysRemaining
    ?? data?.recoveryDaysRemaining
    ?? user?.recoveryDaysRemaining
    ?? totalDays,
  );
  const safeTotal = Math.max(0, Number.isFinite(totalDays) ? totalDays : 0);
  const safeRemaining = Math.max(0, Math.min(Number.isFinite(daysRemaining) ? daysRemaining : safeTotal, safeTotal));
  return {
    surgeryName: episode.surgeryName || episode.surgery?.name || data?.surgeryName || user?.surgeryName || 'Current recovery',
    doctorName: episode.doctorName || episode.doctor?.name || data?.doctorName || user?.doctorName || 'Assigned doctor',
    doctorUniqueId: episode.doctorUniqueId || episode.doctor?.uniqueId || data?.doctorUniqueId || user?.doctorUniqueId || '',
    startDate: episode.startDate || data?.recoveryStartDate || user?.recoveryStartDate || '',
    status: episode.status || 'active',
    totalDays: safeTotal,
    daysRemaining: safeRemaining,
    daysCompleted: Math.max(0, safeTotal - safeRemaining),
  };
}

export default function PatientHome() {
  const { user } = useAuth();
  const { subscribe } = useRealtime();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [confirmSos, setConfirmSos] = useState(false);
  const [sosMessage, setSosMessage] = useState('');
  const [sosVariant, setSosVariant] = useState('success');
  const [sosSending, setSosSending] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadedOnce = useRef(false);

  const load = useCallback(async ({ background = false } = {}) => {
    if (!background) setRefreshing(true);
    try {
      const res = await patientService.getHome();
      setData(res.data);
      loadedOnce.current = true;
      setLoadError('');
    } catch (error) {
      if (!loadedOnce.current) setLoadError(error?.message || 'We could not load your dashboard right now.');
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
    const cleanups = APPOINTMENT_REALTIME_EVENTS.map((eventName) =>
      subscribe(eventName, () => load({ background: true })),
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [subscribe, load]);

  useEffect(() => {
    const cleanups = RECOVERY_REALTIME_EVENTS.map((eventName) =>
      subscribe(eventName, (payload) => {
        if (!payload?.patientId || payload.patientId === user?.id) load({ background: true });
      }),
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [subscribe, user?.id, load]);

  async function sendSos() {
    setSosSending(true);
    try {
      const res = await patientService.sendSos();
      setSosMessage(res.data.message || 'Your SOS alert has been sent.');
      setSosVariant('success');
    } catch (err) {
      setSosMessage(err?.message || 'Could not send the alert. Please try again or call emergency services.');
      setSosVariant('danger');
    } finally {
      setSosSending(false);
      setConfirmSos(false);
      window.setTimeout(() => setSosMessage(''), 6000);
    }
  }

  const medicineCount = data?.medicineReminders?.length || 0;
  const medicines = useMemo(() => (data?.medicineReminders || [])
    .map((medicine) => ({ ...medicine, times: [...(medicine.times || [])].sort((a, b) => timeKey(a) - timeKey(b)) }))
    .sort((a, b) => timeKey(a.times?.[0]) - timeKey(b.times?.[0])), [data?.medicineReminders]);
  const nextDose = useMemo(() => getNextDoseIndex(medicines), [medicines]);
  const upcoming = data?.upcomingAppointment;
  const hasUpcoming = Boolean(upcoming);
  const displayName = user?.name || 'Patient';
  const upcomingDate = useMemo(() => formatDate(upcoming?.date), [upcoming?.date]);
  const upcomingDateObject = useMemo(() => {
    if (!upcoming?.date) return null;
    const date = new Date(`${upcoming.date}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }, [upcoming?.date]);
  const recovery = useMemo(() => normalizeRecovery(data, user), [data, user]);
  const recoveryEndDate = useMemo(
    () => (recovery.startDate && recovery.totalDays ? addDays(recovery.startDate, recovery.totalDays) : ''),
    [recovery.startDate, recovery.totalDays],
  );
  const recoveryPct = recovery.totalDays > 0 ? Math.round((recovery.daysCompleted / recovery.totalDays) * 100) : 0;
  const recoveryStatus = recovery.status === 'completed' || recovery.daysRemaining === 0 ? 'Recovery completed' : 'Active recovery';
  const today = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <PatientDashboardShell>
      <div className="patient-home-page">
      <GlassLensFilter />
      <PageHeader title={`Welcome, ${displayName}`} subtitle={today} />

      {loadError && !data ? (
        <Panel title="Dashboard unavailable" className="mb-6">
          <Alert variant="danger" title="Unable to load your dashboard">{loadError}</Alert>
          <div className="mt-4">
            <Button variant="primary" onClick={() => load()} loading={refreshing}>
              {refreshing ? 'Retrying…' : 'Retry'}
            </Button>
          </div>
        </Panel>
      ) : !data ? (
        <LoadingState label="Loading your recovery dashboard…" rows={4} />
      ) : (
      <>
      {loadError ? (
        <div className="mb-6" role="status" aria-live="polite">
          <Alert variant="warning" title="Dashboard update">{loadError}</Alert>
        </div>
      ) : null}

      {sosMessage ? (
        <div className="mb-6" aria-live="assertive">
          <Alert variant={sosVariant} title={sosVariant === 'success' ? 'SOS alert submitted' : 'SOS could not be sent'}>
            <div className="sos-result-content">
              <span>{sosMessage}</span>
              {sosVariant === 'success' ? (
                <span className="sos-result-followup">Stay where you are and follow your emergency response plan. For immediate life-threatening danger, call local emergency services.</span>
              ) : (
                <span className="sos-result-followup">Please try again or use your phone to contact emergency services directly.</span>
              )}
            </div>
          </Alert>
        </div>
      ) : null}

      {!data.hasActiveCareEpisode ? (
        <Panel title="No active recovery episode">
          <EmptyState
            title="You don't have an active recovery episode"
            subtitle="Ask your surgeon for a Doctor ID and start a new recovery episode from the sidebar."
            action={<Button variant="primary" onClick={() => navigate('/patient/new-episode')}>Start a new recovery episode</Button>}
          />
        </Panel>
      ) : (
      <>
      <Panel className="mb-6" title="Emergency SOS">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <span className="stat-card-icon" aria-hidden="true" style={{ color: 'var(--color-danger)' }}>
              <NavIcon name="alert" size={32} />
            </span>
            <p className="text-sm text-[var(--color-text-soft)] max-w-md">
              Confirming sends an urgent alert to your assigned doctor, or to the hospital administrator if your doctor is off-duty.
            </p>
          </div>
          <Button variant="danger" size="lg" onClick={() => setConfirmSos(true)}>Send SOS</Button>
        </div>
      </Panel>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Days remaining" icon={<NavIcon name="assessment" size={44} />} value={recovery.daysRemaining} accent="crimson" />
        <StatCard
          label="Next appointment"
          icon={<NavIcon name="calendar" size={44} />}
          value={hasUpcoming ? upcomingDateObject?.getDate() ?? '—' : '—'}
          detail={hasUpcoming ? upcomingDateObject?.toLocaleDateString(undefined, { month: 'short' }) : 'Nothing scheduled'}
          accent="crimson"
        />
        <StatCard className="col-span-2 lg:col-span-1" label="Medicines today" icon={<NavIcon name="medicines" size={44} />} value={medicineCount} accent="crimson" />
      </div>

      <Panel className="mb-6" title="Recovery & care summary" action={<Badge variant={recoveryStatus === 'Recovery completed' ? 'success' : 'gold'}>{recoveryStatus}</Badge>}>
        {recovery.totalDays === 0 ? (
          <EmptyState
            title="Recovery plan details are not available yet"
            subtitle="Your active care episode will appear here once the recovery plan has been recorded."
          />
        ) : (
          <div className="recovery-summary-grid">
            <div className="recovery-summary-visual">
              <RecoveryDonut totalDays={recovery.totalDays} daysRemaining={recovery.daysRemaining} size={148} />
              <p className="recovery-summary-progress">{recoveryPct}% of configured recovery period completed</p>
            </div>
            <div className="recovery-summary-details">
              <div className="recovery-summary-primary">
                <div>
                  <p className="eyebrow">Current procedure</p>
                  <h3 className="recovery-summary-title">{recovery.surgeryName}</h3>
                </div>
              </div>
              <div className="recovery-summary-meta">
                <div>
                  <span>Assigned doctor</span>
                  <strong>{formatDoctorName(recovery.doctorName)}</strong>
                </div>
                {recovery.doctorUniqueId ? (
                  <div>
                    <span>Doctor ID</span>
                    <strong>{recovery.doctorUniqueId}</strong>
                  </div>
                ) : null}
                {recovery.startDate ? (
                  <div>
                    <span>Recovery started</span>
                    <strong>{formatDate(recovery.startDate)}</strong>
                  </div>
                ) : null}
                {recoveryEndDate ? (
                  <div>
                    <span>Recovery ends</span>
                    <strong>{formatDate(recoveryEndDate)}</strong>
                  </div>
                ) : null}
                <div>
                  <span>Configured recovery period</span>
                  <strong>{recovery.totalDays} days</strong>
                </div>
              </div>
            </div>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Upcoming appointment"
          action={hasUpcoming ? <Badge variant="success">Upcoming</Badge> : null}
        >
          {!hasUpcoming ? (
            <EmptyState
              title="No upcoming appointments"
              subtitle="Book a visit from the Appointments section whenever you need care."
            />
          ) : (
            <div className="appointment-hero-card">
              <div className="appointment-date-block" aria-hidden="true">
                {upcomingDateObject ? (
                  <>
                    <span>{upcomingDateObject.toLocaleDateString(undefined, { month: 'short' })}</span>
                    <strong>{upcomingDateObject.getDate()}</strong>
                  </>
                ) : (
                  <strong>—</strong>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl text-[var(--color-ink)]">{upcomingDate}</p>
                <p className="text-sm text-[var(--color-text-soft)] mt-1">
                  {upcoming.time} · {formatDoctorName(upcoming.doctorName || 'Assigned doctor')}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge variant="gold">{formatVisitCategory(upcoming.visitCategory)}</Badge>
                  <Badge variant="ink">{formatServiceType(upcoming.serviceType)}</Badge>
                  {upcoming.specialization ? <Badge variant="neutral">{upcoming.specialization}</Badge> : null}
                </div>
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="Today's medicine schedule"
          action={medicineCount ? <Badge variant="gold">{medicineCount} scheduled</Badge> : null}
        >
          {medicineCount === 0 ? (
            <EmptyState title="No medicines scheduled today" subtitle="Your current active prescriptions will appear here." />
          ) : (
            <div className="medicine-reminder-list">
              {medicines.map((medicine, index) => {
                const isNextMedicine = nextDose?.medicineIndex === index;
                return (
                  <article key={`${medicine.name}-${index}`} className={`medicine-reminder-item ${isNextMedicine ? 'medicine-reminder-item-next' : ''}`} aria-label={`${medicine.name} medicine schedule`}>
                    <span className="med-icon" aria-hidden="true"><NavIcon name="medicines" size={20} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-[var(--color-ink)] truncate">{medicine.name}</p>
                      <p className="text-xs text-[var(--color-text-soft)] mt-0.5">{medicine.dosage || 'Dosage not specified'}</p>
                    </div>
                    <div className="medicine-reminder-times" aria-label={`Scheduled times for ${medicine.name}`}>
                      {(medicine.times || []).map((time, timeIndex) => {
                        const isNextTime = isNextMedicine && nextDose?.timeIndex === timeIndex;
                        return (
                          <span key={`${time}-${timeIndex}`} className={`time-chip ${isNextTime ? 'is-next' : ''}`}>
                            <NavIcon name="clock" size={14} />
                            {formatTime(time)}{isNextTime ? ' · Next' : ''}
                          </span>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
      </>
      )}
      </>
      )}
      </div>

      <ConfirmModal
        open={confirmSos}
        title="Confirm SOS alert"
        eyebrow="Urgent safety action"
        body={sosSending
          ? 'Sending your SOS alert now. Keep this screen open while we submit the urgent request.'
          : 'Are you experiencing a medical emergency? Confirm only if you need urgent medical assistance. Your alert will be routed to your assigned doctor or the escalation path when the doctor is off-duty.'}
        confirmLabel={sosSending ? 'Sending…' : 'Yes, alert my doctor now'}
        onConfirm={sendSos}
        onCancel={() => setConfirmSos(false)}
        confirmDisabled={sosSending}
        variant="danger"
        tone="danger"
      />
    </PatientDashboardShell>
  );
}
