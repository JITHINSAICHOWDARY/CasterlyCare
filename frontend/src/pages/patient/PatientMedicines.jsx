import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PatientDashboardShell } from '../../components/RoleDashboardShell';
import { patientService } from '../../api/services/patient';
import { useRealtime } from '../../context/RealtimeContext';
import { CLINICAL_RECORD_REALTIME_EVENTS } from '../../config/realtimeEvents';
import GlassLensFilter from '../../components/GlassLensFilter';
import NavIcon from '../../components/NavIcon';

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

function normalizeMedicine(medicine) {
  const times = Array.isArray(medicine?.times)
    ? medicine.times.filter(Boolean).map((value) => String(value).trim()).filter(Boolean)
    : [];

  return {
    ...medicine,
    id: medicine?.id || null,
    name: medicine?.name || 'Unnamed medicine',
    form: medicine?.form || 'Not recorded',
    dosage: medicine?.dosage || 'Not recorded',
    frequency: medicine?.frequency || 'Not recorded',
    times,
  };
}

function parseReminderTime(value) {
  if (!value) return Number.POSITIVE_INFINITY;

  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return Number.POSITIVE_INFINITY;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]?.toUpperCase();

  if (minute > 59 || hour > 23) return Number.POSITIVE_INFINITY;

  if (period) {
    if (hour < 1 || hour > 12) return Number.POSITIVE_INFINITY;
    if (period === 'AM' && hour === 12) hour = 0;
    if (period === 'PM' && hour !== 12) hour += 12;
  }

  return hour * 60 + minute;
}

function displayTime(value) {
  const raw = String(value || '').trim();
  return raw || 'Time not recorded';
}

function formatAlarmTime(value) {
  const minutes = parseReminderTime(value);
  if (!Number.isFinite(minutes)) return displayTime(value);

  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;

  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

function formatUpdatedAt(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  const seconds = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds} seconds ago`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;

  const weeks = Math.round(days / 7);
  return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
}

function extractMedicines(response) {
  const data = response?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.medicines)) return data.medicines;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

export default function PatientMedicines() {
  const { subscribe } = useRealtime();
  const [medicines, setMedicines] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [formFilter, setFormFilter] = useState('all');
  const [frequencyFilter, setFrequencyFilter] = useState('all');

  const [clockTick, setClockTick] = useState(0);
  const loadedOnce = useRef(false);

  const loadMedicines = useCallback(async ({ background = false } = {}) => {
    if (!background) { setLoadError(''); setLoading(true); }
    try {
      const response = await patientService.getMedicines();
      const rows = extractMedicines(response).map(normalizeMedicine);
      setMedicines(rows);
      setLastLoadedAt(new Date().toISOString());
      loadedOnce.current = true;
    } catch (error) {
      if (!loadedOnce.current) {
        setLoadError(error?.response?.data?.error || error?.message || 'Could not load your medicines. Please try again.');
      }
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMedicines();
    const timer = setInterval(() => loadMedicines({ background: true }), 15000);
    return () => clearInterval(timer);
  }, [loadMedicines]);

  useEffect(() => {
    const cleanups = CLINICAL_RECORD_REALTIME_EVENTS.map((eventName) =>
      subscribe(eventName, () => loadMedicines({ background: true })),
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [subscribe, loadMedicines]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const safeMedicines = useMemo(() => (Array.isArray(medicines) ? medicines : []), [medicines]);

  const sortedMedicines = useMemo(() => [...safeMedicines].sort((a, b) => {
    const first = a.times.length ? Math.min(...a.times.map(parseReminderTime)) : Number.POSITIVE_INFINITY;
    const second = b.times.length ? Math.min(...b.times.map(parseReminderTime)) : Number.POSITIVE_INFINITY;
    return first - second || a.name.localeCompare(b.name);
  }), [safeMedicines]);

  const formOptions = useMemo(
    () => Array.from(new Set(safeMedicines.map((m) => m.form).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [safeMedicines],
  );

  const frequencyOptions = useMemo(
    () => Array.from(new Set(safeMedicines.map((m) => m.frequency).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [safeMedicines],
  );

  const filteredMedicines = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return sortedMedicines.filter((medicine) => {
      const haystack = [medicine.name, medicine.form, medicine.dosage, medicine.frequency].join(' ').toLocaleLowerCase();
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
      const matchesForm = formFilter === 'all' || medicine.form === formFilter;
      const matchesFrequency = frequencyFilter === 'all' || medicine.frequency === frequencyFilter;
      return matchesQuery && matchesForm && matchesFrequency;
    });
  }, [sortedMedicines, query, formFilter, frequencyFilter]);

  const reminderCount = useMemo(
    () => sortedMedicines.reduce((total, medicine) => total + medicine.times.length, 0),
    [sortedMedicines],
  );

  const nowMinutes = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockTick]);

  const reminderTimeline = useMemo(() => {
    const items = filteredMedicines.flatMap((medicine) =>
      medicine.times.map((time) => ({ medicine, time, minutes: parseReminderTime(time) })),
    );
    return items.sort((a, b) => a.minutes - b.minutes || a.medicine.name.localeCompare(b.medicine.name));
  }, [filteredMedicines]);

  const nextReminderKey = useMemo(() => {
    const next = reminderTimeline.find((item) => Number.isFinite(item.minutes) && item.minutes >= nowMinutes);
    return next ? `${next.medicine.id || next.medicine.name}-${next.time}` : null;
  }, [reminderTimeline, nowMinutes]);

  const upcomingReminderCount = useMemo(
    () => reminderTimeline.filter((item) => Number.isFinite(item.minutes) && item.minutes >= nowMinutes).length,
    [reminderTimeline, nowMinutes],
  );

  const medicinesMissingReminderTimes = useMemo(
    () => sortedMedicines.filter((medicine) => medicine.times.length === 0).length,
    [sortedMedicines],
  );

  const medicinesWithInvalidReminderTimes = useMemo(
    () => sortedMedicines.filter((medicine) => medicine.times.some((time) => !Number.isFinite(parseReminderTime(time)))).length,
    [sortedMedicines],
  );

  const showInitialLoading = loading && safeMedicines.length === 0;
  const showEmptyState = !loading && !loadError && safeMedicines.length === 0;

  return (
    <PatientDashboardShell>
      <div className="patient-medicines-page">
      <GlassLensFilter />
      <PageHeader
        title="Medicines"
        subtitle="Your active prescriptions and reminder times."
        action={lastLoadedAt ? <span className="text-xs text-[var(--color-text-soft)]">Updated {formatUpdatedAt(lastLoadedAt)}</span> : null}
      />

      {showInitialLoading ? (
        <Panel><LoadingState label="Loading your active medicines…" /></Panel>
      ) : null}

      {loadError ? (
        <div className="mb-5" role="alert" aria-live="assertive">
          <Alert variant="danger" title={safeMedicines.length ? 'Medicine refresh failed' : 'Medicines unavailable'}>
            <div className="space-y-3">
              <p>{safeMedicines.length ? 'Your previously loaded prescriptions are still shown. ' : ''}{loadError}</p>
              <Button variant="outline" onClick={() => loadMedicines()} loading={loading}>{loading ? 'Retrying…' : 'Retry'}</Button>
            </div>
          </Alert>
        </div>
      ) : null}

      {showEmptyState ? (
        <Panel>
          <EmptyState
            title="No active medicines"
            subtitle="Your doctor will add active prescriptions here when they are part of your current recovery plan."
          />
        </Panel>
      ) : null}

      {!showInitialLoading && !showEmptyState ? (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
            <StatCard label="Active medicines" icon={<NavIcon name="medicines" size={40} />} value={safeMedicines.length} accent="crimson" />
            <StatCard label="Reminder times" icon={<NavIcon name="clock" size={40} />} value={reminderCount} accent="gold" />
            <StatCard label="Upcoming today" icon={<NavIcon name="calendar" size={40} />} value={upcomingReminderCount} accent="forest" />
            <StatCard label="Prescription status" icon={<NavIcon name="check" size={40} />} value="Active" accent="forest" />
          </div>

          <Panel className="mb-6" title="Today's schedule">
            {reminderTimeline.length === 0 ? (
              <EmptyState
                title="No reminder times recorded"
                subtitle="Your active prescriptions are available below, but no reminder times have been recorded for them yet."
              />
            ) : (
              <div className="medicine-daily-schedule" role="list" aria-label="Today's medicine reminder schedule">
                {reminderTimeline.map(({ medicine, time, minutes }, index) => {
                  const itemKey = `${medicine.id || medicine.name}-${time}`;
                  const isNext = itemKey === nextReminderKey;
                  const isPast = Number.isFinite(minutes) && minutes < nowMinutes;

                  return (
                    <div
                      className={`medicine-schedule-row ${isNext ? 'medicine-schedule-row-next' : ''} ${isPast ? 'medicine-schedule-row-past' : ''}`}
                      key={`${itemKey}-${index}`}
                      role="listitem"
                    >
                      <div className="medicine-schedule-time" aria-label={`Reminder time ${formatAlarmTime(time)}`}>
                        <NavIcon name="clock" size={16} />
                        <strong>{formatAlarmTime(time)}</strong>
                      </div>

                      <div className="medicine-schedule-copy">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-[var(--color-ink)]">{medicine.name}</p>
                          {isNext ? <Badge variant="gold">Next dose</Badge> : null}
                          {!isNext && isPast ? <span className="medicine-schedule-state">Earlier today</span> : null}
                        </div>
                        <p className="text-sm text-[var(--color-text-soft)]">
                          {medicine.dosage} · {medicine.form} · {medicine.frequency}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {medicinesMissingReminderTimes || medicinesWithInvalidReminderTimes ? (
            <Alert className="mb-6" variant="warning" title="Some reminder times need attention">
              <p className="text-sm">
                {medicinesMissingReminderTimes ? `${medicinesMissingReminderTimes} ${medicinesMissingReminderTimes === 1 ? 'prescription has' : 'prescriptions have'} no reminder time recorded. ` : ''}
                {medicinesWithInvalidReminderTimes ? `${medicinesWithInvalidReminderTimes} ${medicinesWithInvalidReminderTimes === 1 ? 'prescription has' : 'prescriptions have'} a reminder time that could not be interpreted.` : ''}
                {' '}Confirm the schedule with your doctor rather than relying on an unrecorded time.
              </p>
            </Alert>
          ) : null}

          <Panel title="Active prescription details">
            <fieldset className="medicine-filter-toolbar" aria-label="Medicine filters">
              <label className="medicine-filter-field" htmlFor="medicine-search">
                <span>Search</span>
                <input
                  id="medicine-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search medicine, dosage, or frequency"
                  aria-label="Search active medicines"
                />
              </label>

              <label className="medicine-filter-field" htmlFor="medicine-form-filter">
                <span>Form</span>
                <select id="medicine-form-filter" value={formFilter} onChange={(event) => setFormFilter(event.target.value)} aria-label="Filter medicines by form">
                  <option value="all">All forms</option>
                  {formOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>

              <label className="medicine-filter-field" htmlFor="medicine-frequency-filter">
                <span>Frequency</span>
                <select id="medicine-frequency-filter" value={frequencyFilter} onChange={(event) => setFrequencyFilter(event.target.value)} aria-label="Filter medicines by frequency">
                  <option value="all">All frequencies</option>
                  {frequencyOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>

              {query || formFilter !== 'all' || frequencyFilter !== 'all' ? (
                <button
                  type="button"
                  className="btn btn-ghost medicine-filter-clear"
                  onClick={() => { setQuery(''); setFormFilter('all'); setFrequencyFilter('all'); }}
                >
                  Clear filters
                </button>
              ) : null}
            </fieldset>

            <p className="mb-4 text-xs text-[var(--color-text-soft)]" aria-live="polite">
              Showing {filteredMedicines.length} of {sortedMedicines.length} active {sortedMedicines.length === 1 ? 'prescription' : 'prescriptions'}.
            </p>

            {filteredMedicines.length === 0 ? (
              <EmptyState
                title="No prescriptions match these filters"
                subtitle="Clear the filters or try a different medicine name, form, dosage, or frequency."
              />
            ) : (
              <div className="medicine-prescription-grid">
                {filteredMedicines.map((medicine) => (
                  <article key={medicine.id || medicine.name} className="medicine-prescription-card">
                    <div className="medicine-prescription-card-top">
                      <div className="min-w-0">
                        <h3 className="break-words font-display text-lg text-[var(--color-ink)]">{medicine.name}</h3>
                        <p className="mt-1 text-xs text-[var(--color-text-soft)]">{medicine.form}</p>
                      </div>
                      <Badge variant="forest">Active</Badge>
                    </div>

                    <dl className="medicine-prescription-meta">
                      <div><dt>Dosage</dt><dd>{medicine.dosage}</dd></div>
                      <div><dt>Frequency</dt><dd>{medicine.frequency}</dd></div>
                    </dl>

                    <div className="mt-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-soft)]">Reminder times</p>
                      {medicine.times.length ? (
                        <div className="flex flex-wrap gap-2">
                          {medicine.times.map((time, index) => {
                            const isNext = `${medicine.id || medicine.name}-${time}` === nextReminderKey;
                            return (
                              <span key={`${time}-${index}`} className={`time-chip ${isNext ? 'is-next' : ''}`}>
                                <NavIcon name="clock" size={14} />
                                {displayTime(time)}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--color-text-soft)]">No reminder times recorded.</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Panel>
        </>
      ) : null}
      </div>
    </PatientDashboardShell>
  );
}
