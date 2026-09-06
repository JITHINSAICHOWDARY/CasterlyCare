import { useEffect, useMemo, useState } from 'react';
import PatientDashboardShell from '../../components/PatientDashboardShell';
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
  SectionHeading,
  StatCard,
} from '../../components/ui';
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

// ---- Patient dashboard loading, empty, error & recovery states: Phase 2.4.7 ----
// ---- Patient dashboard visual/content consistency: Phase 2.4.9 ----
export default function PatientHome() {
  const { user } = useAuth();
  const { subscribe } = useRealtime();
  const [data, setData] = useState(null);
  const [confirmSos, setConfirmSos] = useState(false);
  const [sosMessage, setSosMessage] = useState('');
  const [sosVariant, setSosVariant] = useState('success');
  const [sosSending, setSosSending] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newEpisode, setNewEpisode] = useState({ doctorUniqueId: '', surgeryName: '', recoveryTotalDays: '14' });
  const [episodeSubmitting, setEpisodeSubmitting] = useState(false);
  const [episodeError, setEpisodeError] = useState('');

  async function load({ preserveData = false } = {}) {
    setLoadError('');
    if (preserveData && data) setIsRefreshing(true);
    try {
      const res = await patientService.getHome();
      setData(res.data);
    } catch (err) {
      setLoadError(err?.message || 'We could not load your dashboard right now.');
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const cleanups = APPOINTMENT_REALTIME_EVENTS.map((eventName) =>
      subscribe(eventName, () => load({ preserveData: true })),
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [subscribe]);

  useEffect(() => {
    const cleanups = RECOVERY_REALTIME_EVENTS.map((eventName) =>
      subscribe(eventName, (payload) => {
        if (!payload?.patientId || payload.patientId === user?.id) load({ preserveData: true });
      }),
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [subscribe, user?.id]);

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

  async function startCareEpisode(event) {
    event.preventDefault();
    setEpisodeError('');
    setEpisodeSubmitting(true);
    try {
      await patientService.startCareEpisode({
        doctorUniqueId: newEpisode.doctorUniqueId,
        surgeryName: newEpisode.surgeryName,
        recoveryTotalDays: Number(newEpisode.recoveryTotalDays) || 14,
      });
      setNewEpisode({ doctorUniqueId: '', surgeryName: '', recoveryTotalDays: '14' });
      await load({ preserveData: true });
    } catch (err) {
      setEpisodeError(err?.response?.data?.error || err?.message || 'Could not start a new recovery episode. Please double-check the doctor ID.');
    } finally {
      setEpisodeSubmitting(false);
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
  const recoveryPct = recovery.totalDays > 0 ? Math.round((recovery.daysCompleted / recovery.totalDays) * 100) : 0;
  const recoveryStatus = recovery.status === 'completed' || recovery.daysRemaining === 0 ? 'Recovery completed' : 'Active recovery';

  if (!data && !loadError) {
    return (
      <PatientDashboardShell>
        <PageHeader
          eyebrow="Your care journey"
          title={`Welcome, ${displayName}`}
          subtitle="Preparing your recovery dashboard and today's care information."
        />
        <Panel className="patient-dashboard-state-panel">
          <LoadingState label="Loading your recovery dashboard…" />
        </Panel>
      </PatientDashboardShell>
    );
  }

  if (!data && loadError) {
    return (
      <PatientDashboardShell>
        <PageHeader
          eyebrow="Your care journey"
          title={`Welcome, ${displayName}`}
          subtitle="We could not retrieve your latest dashboard information."
        />
        <Panel className="patient-dashboard-state-panel">
          <EmptyState
            title="Your dashboard is temporarily unavailable"
            subtitle="Your account is still available. Please retry the dashboard connection; no clinical conclusion is being drawn from this loading error."
            action={<Button variant="primary" onClick={() => load()} loading={isRefreshing}>Retry dashboard</Button>}
          />
        </Panel>
      </PatientDashboardShell>
    );
  }

  return (
    <PatientDashboardShell>
      <PageHeader
        eyebrow="Your care journey"
        title={`Welcome, ${displayName}`}
        subtitle="A clear view of today's recovery plan, appointments, medicines, and urgent support."
      />

      {loadError ? (
        <div className="mb-6" role="status" aria-live="polite">
          <Alert variant="warning" title="Showing your last available dashboard data">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{loadError} Your previously loaded information remains visible while you reconnect.</span>
              <Button variant="outline" size="sm" onClick={() => load({ preserveData: true })} loading={isRefreshing}>Refresh</Button>
            </div>
          </Alert>
        </div>
      ) : null}

      {isRefreshing ? (
        <div className="patient-dashboard-refreshing" role="status" aria-live="polite">
          <LoadingState label="Refreshing your dashboard…" />
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

      {data && !data.hasActiveCareEpisode ? (
        <Panel
          className="mb-6"
          title="Start a new recovery episode"
          subtitle="You have no active care episode right now. If your surgeon has given you a new Doctor ID for a new surgery, enter it below to begin a new recovery episode."
        >
          <form onSubmit={startCareEpisode} className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <label className="flex flex-col gap-1 text-sm">
              <span className="field-label">Doctor ID</span>
              <input
                className="field-input"
                value={newEpisode.doctorUniqueId}
                onChange={(event) => setNewEpisode((prev) => ({ ...prev, doctorUniqueId: event.target.value }))}
                placeholder="e.g. DOC-3L4SUA"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="field-label">Surgery name</span>
              <input
                className="field-input"
                value={newEpisode.surgeryName}
                onChange={(event) => setNewEpisode((prev) => ({ ...prev, surgeryName: event.target.value }))}
                placeholder="e.g. Cardiac Bypass"
                required
              />
            </label>
            <p className="sm:col-span-2 text-xs text-[var(--color-text-soft)]">
              Your surgeon will set and can adjust your exact recovery duration in your patient record.
            </p>
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary" loading={episodeSubmitting}>Start recovery episode</Button>
            </div>
          </form>
          {episodeError ? (
            <div className="mt-3" role="alert" aria-live="assertive">
              <Alert variant="danger" title="Could not start episode">{episodeError}</Alert>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {data && data.hasActiveCareEpisode ? (
      <>
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr] mb-6">
        <section className="dashboard-emergency-card" aria-labelledby="emergency-title">
          <div className="dashboard-emergency-mark" aria-hidden="true">SOS</div>
          <div className="min-w-0 flex-1">
            <p className="eyebrow dashboard-emergency-eyebrow">Urgent assistance</p>
            <h2 id="emergency-title" className="dashboard-emergency-title">Medical emergency?</h2>
            <p className="dashboard-emergency-copy">
              Confirming SOS sends an urgent alert to your assigned doctor. If your doctor is off-duty, the escalation route is used.
            </p>
          </div>
          <Button variant="danger" size="lg" onClick={() => setConfirmSos(true)} className="dashboard-sos-button">
            <span aria-hidden="true">🚨</span>
            Send SOS
          </Button>
        </section>

        <div className="grid grid-cols-2 gap-4">
          <StatCard
            label="Next appointment"
            value={hasUpcoming ? upcoming.time : '—'}
            detail={hasUpcoming ? upcomingDate : 'Nothing scheduled'}
            accent="gold"
            icon="▤"
          />
          <StatCard
            label="Medicine schedule"
            value={medicineCount}
            detail={medicineCount === 1 ? 'scheduled medicine' : 'scheduled medicines'}
            accent="forest"
            icon="⚕"
          />
        </div>
      </div>

      <Panel
        className="mb-6"
        title="Recovery & care summary"
        subtitle="Current care episode and recorded recovery progress"
        action={<Badge variant={recoveryStatus === 'Recovery completed' ? 'success' : 'gold'}>{recoveryStatus}</Badge>}
      >
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
                <div className="recovery-summary-days">
                  <strong>{recovery.daysRemaining}</strong>
                  <span>days remaining</span>
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
                <div>
                  <span>Configured recovery period</span>
                  <strong>{recovery.totalDays} days</strong>
                </div>
              </div>
              <p className="recovery-summary-note">
                Recovery duration reflects the configured care plan. Clinical progress and discharge decisions remain with your medical team.
              </p>
            </div>
          </div>
        )}
      </Panel>
      </>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Upcoming appointment"
          subtitle="Your next scheduled care visit"
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
          subtitle="Your prescribed doses and reminder times for today"
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
                    <div className="medicine-reminder-icon" aria-hidden="true">◷</div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-[var(--color-ink)] truncate">{medicine.name}</p>
                      <p className="text-xs text-[var(--color-text-soft)] mt-0.5">{medicine.dosage || 'Dosage not specified'}</p>
                    </div>
                    <div className="medicine-reminder-times" aria-label={`Scheduled times for ${medicine.name}`}>
                      {(medicine.times || []).map((time, timeIndex) => (
                        <Badge key={`${time}-${timeIndex}`} variant={isNextMedicine && nextDose?.timeIndex === timeIndex ? 'crimson' : 'gold'}>
                          {formatTime(time)}{isNextMedicine && nextDose?.timeIndex === timeIndex ? ' · Next' : ''}
                        </Badge>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <Panel className="mt-6" title="Need help choosing what to do next?" subtitle="Your support tools are always available from the floating chat control.">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <SectionHeading
              title="Kingslayer"
              subtitle="Use Kingslayer for general guidance and app navigation."
            />
            <p className="text-xs text-[var(--color-text-soft)] mt-1 max-w-2xl">
              For urgent concerns that need your doctor's attention, use Emergency Chat rather than asking the AI assistant to escalate a case.
            </p>
          </div>
          <div className="support-tool-hint" aria-hidden="true">🗡️</div>
        </div>
      </Panel>

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
