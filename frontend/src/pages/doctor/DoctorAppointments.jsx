import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRealtime } from '../../context/RealtimeContext';
import { APPOINTMENT_REALTIME_EVENTS } from '../../config/realtimeEvents';
import { doctorService } from '../../api/services/doctor';
import { DoctorDashboardShell as DashboardShell } from '../../components/RoleDashboardShell';
import { Alert, Button, ConfirmModal, EmptyState, LoadingState, Modal, Panel, PageHeader } from '../../components/ui';
import { apiErrorMessage } from '../../api/client';
import SlotPicker from '../../components/SlotPicker';
import DatePicker from '../../components/DatePicker';
import GlassLensFilter from '../../components/GlassLensFilter';
import { slotLabel } from '../../utils/time';

const TABS = [['upcoming', 'Upcoming'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];
const EMPTY = {
  upcoming: ['No upcoming appointments', 'Follow-ups and patient bookings will appear here.'],
  completed: ['No completed appointments yet', 'Appointments you mark completed are kept here.'],
  cancelled: ['No cancelled appointments', 'Cancelled appointments are kept here.'],
};

function titleCase(value = '') {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseDateTime(date, time) {
  const parsed = new Date(`${date || ''}T${time || '00:00'}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function slotHasPassed(appointment) {
  const at = parseDateTime(appointment.date, appointment.time);
  return !at || at <= new Date();
}

function localISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "Today", "Tomorrow", "Yesterday", else "Wednesday 23 September".
function dayHeading(date) {
  const parsed = new Date(`${date}T00:00:00`);
  const long = Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', ...(parsed.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
  if (date === localISO(0)) return { label: 'Today', long };
  if (date === localISO(1)) return { label: 'Tomorrow', long };
  if (date === localISO(-1)) return { label: 'Yesterday', long };
  return { label: long, long: '' };
}

export default function DoctorAppointments() {
  const { subscribe } = useRealtime();
  const [appointments, setAppointments] = useState(null);
  const [tab, setTab] = useState('upcoming');
  const [query, setQuery] = useState('');
  const [rescheduling, setRescheduling] = useState(null);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [actionError, setActionError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async ({ preserve = false } = {}) => {
    if (!preserve) setLoadError('');
    try {
      const res = await doctorService.getAppointments();
      setAppointments(Array.isArray(res.data?.appointments) ? res.data.appointments : []);
      setLoadError('');
    } catch {
      if (!preserve) setLoadError('Unable to load appointments.');
      else setActionError('Appointments could not be refreshed. The last loaded schedule is still shown.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const cleanups = APPOINTMENT_REALTIME_EVENTS.map((eventName) =>
      subscribe(eventName, () => load({ preserve: true })),
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [subscribe, load]);

  const counts = useMemo(() => Object.fromEntries(TABS.map(([key]) => [key, (appointments || []).filter((a) => a.status === key).length])), [appointments]);

  // Appointments in the chosen tab, matching the search, grouped by day.
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = (appointments || [])
      .filter((a) => a.status === tab)
      .filter((a) => !needle || [a.patientName, a.surgeryName, titleCase(a.visitCategory), titleCase(a.serviceType), a.date, slotLabel(a.time)].filter(Boolean).join(' ').toLowerCase().includes(needle))
      .sort((a, b) => {
        const diff = (parseDateTime(a.date, a.time)?.getTime() ?? 0) - (parseDateTime(b.date, b.time)?.getTime() ?? 0);
        return tab === 'upcoming' ? diff : -diff;
      });
    const byDay = new Map();
    list.forEach((a) => byDay.set(a.date, [...(byDay.get(a.date) || []), a]));
    return [...byDay.entries()];
  }, [appointments, tab, query]);

  async function run(id, action, done) {
    setBusyId(id);
    setActionError('');
    try {
      await action(id);
      done();
      await load({ preserve: true });
    } catch (err) {
      done();
      setActionError(apiErrorMessage(err));
    } finally {
      setBusyId('');
    }
  }

  return (
    <DashboardShell>
      <div className="doctor-appointments-page">
        <GlassLensFilter />
        <PageHeader title="Appointments" subtitle={appointments ? `${counts.upcoming} upcoming` : 'Your schedule'} />

        {actionError && <div className="mb-4" role="status" aria-live="polite"><Alert variant="warning" title="Schedule update">{actionError}</Alert></div>}

        <div className="admin-toolbar mb-5">
          <div className="admin-chips" role="tablist" aria-label="Appointment status">
            {TABS.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={`admin-chip ${tab === key ? 'is-active' : ''}`} onClick={() => setTab(key)}>
                {label} ({counts[key] ?? 0})
              </button>
            ))}
          </div>
          <div className="admin-search">
            <label className="sr-only" htmlFor="doctor-appointments-search">Search appointments</label>
            <input id="doctor-appointments-search" className="field-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search patient, surgery, service or date" autoComplete="off" />
          </div>
        </div>

        {loadError && !appointments ? (
          <Panel>
            <Alert variant="danger" title="Appointments unavailable">{loadError}</Alert>
            <div className="mt-3"><Button onClick={() => load()}>Retry</Button></div>
          </Panel>
        ) : !appointments ? (
          <LoadingState label="Loading appointments…" rows={4} />
        ) : groups.length === 0 ? (
          <Panel>
            <EmptyState
              title={query ? 'No matching appointments' : EMPTY[tab][0]}
              subtitle={query ? 'Try a different patient, service or date.' : EMPTY[tab][1]}
              action={query ? <Button variant="outline" onClick={() => setQuery('')}>Clear search</Button> : null}
            />
          </Panel>
        ) : (
          <div className="appt-days" role="tabpanel">
            {groups.map(([date, items]) => {
              const heading = dayHeading(date);
              return (
                <section key={date} className="appt-day" aria-label={heading.long || heading.label}>
                  <h2 className="appt-day-title">{heading.label}{heading.long ? <span>{heading.long}</span> : null}</h2>
                  <Panel className="appt-day-card">
                    <ul className="appt-rows">
                      {items.map((a) => {
                        const passed = slotHasPassed(a);
                        return (
                          <li key={a.id} className="appt-row">
                            <div className="appt-time">{slotLabel(a.time)}</div>
                            <div className="appt-info">
                              <Link to={`/doctor/patients/${a.patientId}`} className="appt-patient">{a.patientName || 'Patient name not recorded'}</Link>
                              <p className="appt-meta">{[a.surgeryName || 'Surgery not recorded', titleCase(a.visitCategory), titleCase(a.serviceType)].filter(Boolean).join(' · ')}</p>
                            </div>
                            {a.status === 'upcoming' ? (
                              <div className="appt-actions">
                                <Button variant="primary" size="sm" onClick={() => setCompleteTarget(a)} disabled={!passed || busyId === a.id}>Mark completed</Button>
                                <Button variant="outline" size="sm" onClick={() => setRescheduling(a)} disabled={busyId === a.id}>Reschedule</Button>
                                <Button variant="ghost" size="sm" className="appt-cancel" onClick={() => setCancelTarget(a)} disabled={busyId === a.id}>Cancel</Button>
                                {!passed ? <span className="appt-hint">Available after {slotLabel(a.time)}</span> : null}
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </Panel>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <RescheduleModal appt={rescheduling} onClose={() => setRescheduling(null)} onDone={async () => { setRescheduling(null); await load({ preserve: true }); }} />

      <ConfirmModal
        open={!!completeTarget}
        tone="info"
        variant="primary"
        eyebrow="Mark completed"
        title="Mark this appointment completed?"
        body={completeTarget ? `${completeTarget.patientName || 'This patient'}'s ${titleCase(completeTarget.serviceType)} at ${slotLabel(completeTarget.time)} will be marked completed.` : ''}
        confirmLabel={busyId === completeTarget?.id ? 'Completing…' : 'Mark completed'}
        confirmDisabled={busyId === completeTarget?.id}
        onConfirm={() => run(completeTarget.id, doctorService.completeAppointment, () => setCompleteTarget(null))}
        onCancel={() => { if (!busyId) setCompleteTarget(null); }}
      />

      <ConfirmModal
        open={!!cancelTarget}
        eyebrow="Cancel appointment"
        title="Cancel this appointment?"
        body={cancelTarget ? `${cancelTarget.patientName || 'The patient'} will be told their ${titleCase(cancelTarget.serviceType)} at ${slotLabel(cancelTarget.time)} was cancelled, and the time becomes free again.` : ''}
        confirmLabel={busyId === cancelTarget?.id ? 'Cancelling…' : 'Cancel appointment'}
        confirmDisabled={busyId === cancelTarget?.id}
        onConfirm={() => run(cancelTarget.id, doctorService.cancelAppointment, () => setCancelTarget(null))}
        onCancel={() => { if (!busyId) setCancelTarget(null); }}
      />
    </DashboardShell>
  );
}

function RescheduleModal({ appt, onClose, onDone }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (appt) {
      setDate(appt.date || '');
      setTime('');
      setError('');
      setSaving(false);
    }
  }, [appt]);

  const fetchDays = useCallback((month) => doctorService.getSlotDays(month, appt?.id).then((res) => res.data?.days || []), [appt?.id]);

  async function submit(event) {
    event.preventDefault();
    if (!date || !time) { setError('Choose a date and one of your open times.'); return; }
    setSaving(true);
    setError('');
    try {
      await doctorService.rescheduleAppointment(appt.id, { date, time });
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!appt} title="Reschedule appointment" onClose={() => saving ? undefined : onClose()}>
      {appt && (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <p className="text-sm text-[var(--color-text-soft)]">
            Moving <strong>{appt.patientName || 'this patient'}</strong>’s {titleCase(appt.serviceType)} appointment. You can only choose times published for you.
          </p>
          <div>
            <label htmlFor="doctor-reschedule-date" className="field-label">New day</label>
            <DatePicker id="doctor-reschedule-date" value={date} onChange={(next) => { setDate(next); setTime(''); }} fetchEnabledDays={fetchDays} />
          </div>
          <div>
            <p className="field-label">New time</p>
            <SlotPicker date={date} value={time} onChange={setTime} excludeAppointmentId={appt.id} />
          </div>
          {error && <Alert variant="danger" title="Reschedule not saved" role="alert">{error}</Alert>}
          <div className="flex justify-end gap-2 flex-wrap">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving || !time}>{saving ? 'Saving…' : 'Save new time'}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
