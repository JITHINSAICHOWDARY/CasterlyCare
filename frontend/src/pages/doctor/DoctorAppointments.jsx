import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRealtime } from '../../context/RealtimeContext';
import { APPOINTMENT_REALTIME_EVENTS } from '../../config/realtimeEvents';
import { doctorService } from '../../api/services/doctor';
import { DoctorDashboardShell as DashboardShell } from '../../components/RoleDashboardShell';
import { Alert, Badge, Button, EmptyState, Modal, Panel } from '../../components/ui';

const STATUS_VARIANT = { upcoming: 'gold', completed: 'forest', cancelled: 'danger' };
const STATUS_LABEL = { upcoming: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled' };
const FILTERS = ['all', 'upcoming', 'completed', 'cancelled'];

function titleCase(value = '') {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseDateTime(date, time) {
  const value = `${date || ''}T${time || '00:00'}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(date) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date || 'Not recorded';
  return parsed.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(time) {
  const [hours, minutes] = String(time || '').split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return time || 'Not recorded';
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function DoctorAppointments() {
  const { subscribe } = useRealtime();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [rescheduling, setRescheduling] = useState(null);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [actionError, setActionError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [completingId, setCompletingId] = useState('');

  async function load({ preserve = false } = {}) {
    if (preserve) setRefreshing(true);
    else setLoadError('');
    try {
      const res = await doctorService.getAppointments();
      setAppointments(Array.isArray(res.data?.appointments) ? res.data.appointments : []);
      setLoadError('');
    } catch {
      if (!preserve) setLoadError('Unable to load appointments.');
      else setActionError('Appointments could not be refreshed. The last loaded schedule is still shown.');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const cleanups = APPOINTMENT_REALTIME_EVENTS.map((eventName) =>
      subscribe(eventName, () => load({ preserve: true })),
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [subscribe]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (appointments || [])
      .filter((appointment) => filter === 'all' || appointment.status === filter)
      .filter((appointment) => {
        if (!normalized) return true;
        const haystack = [
          appointment.patientName,
          appointment.surgeryName,
          appointment.visitCategory,
          appointment.serviceType,
          appointment.date,
          appointment.time,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(normalized);
      })
      .sort((a, b) => {
        const aDate = parseDateTime(a.date, a.time)?.getTime() ?? 0;
        const bDate = parseDateTime(b.date, b.time)?.getTime() ?? 0;
        if (filter === 'completed' || filter === 'cancelled') return bDate - aDate;
        return aDate - bDate;
      });
  }, [appointments, filter, query]);

  const counts = useMemo(() => FILTERS.reduce((acc, item) => {
    acc[item] = item === 'all' ? (appointments || []).length : (appointments || []).filter((a) => a.status === item).length;
    return acc;
  }, {}), [appointments]);

  async function complete(id) {
    setCompletingId(id);
    setActionError('');
    try {
      await doctorService.completeAppointment(id);
      setCompleteTarget(null);
      await load({ preserve: true });
    } catch {
      setActionError('This appointment could not be marked completed. Please retry.');
    } finally {
      setCompletingId('');
    }
  }

  return (
    <DashboardShell>
      <div className="flex flex-col gap-1 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl text-[var(--color-ink)] mb-1">Appointments</h1>
            <p className="text-[var(--color-text-soft)]">Manage your complete schedule — previous, present, and future.</p>
          </div>
          <Button variant="outline" onClick={() => load({ preserve: true })} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh schedule'}
          </Button>
        </div>
      </div>

      {actionError && <div className="mb-4" role="status" aria-live="polite"><Alert variant="warning" title="Schedule update">{actionError}</Alert></div>}

      <Panel className="mb-4">
        <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Appointment status filters">
          {FILTERS.map((item) => (
            <button
              key={item}
              role="tab"
              type="button"
              aria-selected={filter === item}
              tabIndex={filter === item ? 0 : -1}
              className={`btn ${filter === item ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFilter(item)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') { event.preventDefault(); setFilter(FILTERS[(FILTERS.indexOf(item) + 1) % FILTERS.length]); }
                if (event.key === 'ArrowLeft') { event.preventDefault(); setFilter(FILTERS[(FILTERS.indexOf(item) - 1 + FILTERS.length) % FILTERS.length]); }
                if (event.key === 'Home') { event.preventDefault(); setFilter(FILTERS[0]); }
                if (event.key === 'End') { event.preventDefault(); setFilter(FILTERS[FILTERS.length - 1]); }
              }}
            >
              {titleCase(item)} <span aria-hidden="true">({counts[item] ?? 0})</span>
            </button>
          ))}
        </div>
        <div className="mt-4">
          <label htmlFor="doctor-appointments-search" className="field-label">Search appointments</label>
          <input
            id="doctor-appointments-search"
            className="field-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search patient, surgery, service, or date"
            autoComplete="off"
          />
        </div>
      </Panel>

      {loadError && !appointments ? (
        <Panel>
          <Alert variant="danger" title="Appointments unavailable">
            {loadError}
            <div className="mt-3"><Button onClick={() => load()}>Retry</Button></div>
          </Alert>
        </Panel>
      ) : !appointments ? (
        <Panel><p className="text-sm text-[var(--color-text-soft)]" aria-live="polite">Loading appointments…</p></Panel>
      ) : (
        <Panel>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <p className="text-sm text-[var(--color-text-soft)]" aria-live="polite">
              Showing {visible.length} of {counts[filter] ?? 0} {filter === 'all' ? 'appointments' : STATUS_LABEL[filter].toLowerCase() + ' appointments'}.
            </p>
            {query && <Button variant="ghost" onClick={() => setQuery('')}>Clear search</Button>}
          </div>

          {visible.length === 0 ? (
            <EmptyState title={query ? 'No matching appointments' : 'No appointments in this view'} description={query ? 'Try a different patient, service, or date.' : 'Appointments will appear here when they are scheduled.'} />
          ) : (
            <div className="space-y-3" role="tabpanel" aria-label={`${titleCase(filter)} appointments`}>
              {visible.map((appointment) => (
                <article key={appointment.id} className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-md border border-[var(--color-line)]">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="text-center w-24 shrink-0">
                      <p className="text-xs text-[var(--color-text-soft)]">{formatDate(appointment.date)}</p>
                      <p className="font-semibold text-sm">{formatTime(appointment.time)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--color-ink)] break-words">{appointment.patientName || 'Patient name not recorded'}</p>
                      <p className="text-sm text-[var(--color-text-soft)] break-words">
                        {appointment.surgeryName || 'Surgery not recorded'} · {titleCase(appointment.visitCategory)} · {titleCase(appointment.serviceType)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Badge variant={STATUS_VARIANT[appointment.status]}>{STATUS_LABEL[appointment.status] || titleCase(appointment.status)}</Badge>
                    <Button variant="outline" onClick={() => navigate(`/doctor/patients/${appointment.patientId}`)}>Patient details</Button>
                    {appointment.status === 'upcoming' && (
                      <>
                        <Button variant="outline" onClick={() => setRescheduling(appointment)}>Reschedule</Button>
                        <Button variant="gold" onClick={() => setCompleteTarget(appointment)}>Mark completed</Button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>
      )}

      <RescheduleModal appt={rescheduling} onClose={() => setRescheduling(null)} onDone={async () => { setRescheduling(null); await load({ preserve: true }); }} />
      <Modal open={!!completeTarget} title="Mark appointment completed?" onClose={() => completingId ? undefined : setCompleteTarget(null)}>
        {completeTarget && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-text-soft)]">
              Mark {completeTarget.patientName || 'this patient'}’s {titleCase(completeTarget.serviceType)} appointment on {formatDate(completeTarget.date)} at {formatTime(completeTarget.time)} as completed?
            </p>
            <div className="flex justify-end gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setCompleteTarget(null)} disabled={!!completingId}>Keep upcoming</Button>
              <Button variant="gold" onClick={() => complete(completeTarget.id)} disabled={!!completingId}>
                {completingId ? 'Completing…' : 'Mark completed'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
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
      setTime(appt.time || '');
      setError('');
      setSaving(false);
    }
  }, [appt]);

  function validate() {
    if (!date || !time) return 'Choose both a date and time.';
    const selected = parseDateTime(date, time);
    if (!selected) return 'Enter a valid appointment date and time.';
    if (selected.getTime() <= Date.now()) return 'Choose a future date and time.';
    return '';
  }

  async function submit(event) {
    event.preventDefault();
    const validation = validate();
    if (validation) { setError(validation); return; }
    setSaving(true);
    setError('');
    try {
      await doctorService.rescheduleAppointment(appt.id, { date, time });
      onDone();
    } catch {
      setError('Could not reschedule this appointment. Check the slot and retry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!appt} title="Reschedule appointment" onClose={() => saving ? undefined : onClose()}>
      {appt && (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <p className="text-sm text-[var(--color-text-soft)]">
            Moving <strong>{appt.patientName || 'this patient'}</strong>’s {titleCase(appt.serviceType)} appointment.
          </p>
          <div>
            <label htmlFor="doctor-reschedule-date" className="field-label">New date</label>
            <input id="doctor-reschedule-date" type="date" required className="field-input" value={date} onChange={(event) => setDate(event.target.value)} aria-invalid={!!error} />
          </div>
          <div>
            <label htmlFor="doctor-reschedule-time" className="field-label">New time</label>
            <input id="doctor-reschedule-time" type="time" required className="field-input" value={time} onChange={(event) => setTime(event.target.value)} aria-invalid={!!error} />
          </div>
          {error && <Alert variant="danger" title="Reschedule not saved" role="alert">{error}</Alert>}
          <div className="flex justify-end gap-2 flex-wrap">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save new time'}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
