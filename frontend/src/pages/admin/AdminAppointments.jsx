// Phase 2.12.3 — Admin Master Appointment Calendar & Clash Resolution UX
import NavIcon from '../../components/NavIcon';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminService } from '../../api/services/admin';
import { AdminDashboardShell as DashboardShell } from '../../components/RoleDashboardShell';
import {
  Alert,
  AlarmTimePicker,
  Badge,
  Button,
  EmptyState,
  LoadingState,
  Modal,
  PageHeader,
  Panel,
  SectionHeading,
  StatCard,
} from '../../components/ui';
import { apiErrorMessage } from '../../api/client';
import { useRealtime } from '../../context/RealtimeContext';
import { APPOINTMENT_REALTIME_EVENTS } from '../../config/realtimeEvents';

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);

  return Number.isNaN(date.getTime())
    ? value || 'Date unavailable'
    : date.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
}

function normalizeAppointments(value) {
  let source = [];

  if (Array.isArray(value)) {
    source = value;
  } else if (Array.isArray(value?.appointments)) {
    source = value.appointments;
  } else if (Array.isArray(value?.data)) {
    source = value.data;
  }

  return source.map((appointment) => ({
    ...appointment,

    patientName:
      appointment?.patientName ||
      appointment?.patient?.name ||
      'Unknown patient',

    patientEmail:
      appointment?.patientEmail ||
      appointment?.patient?.email ||
      null,

    patientPhone:
      appointment?.patientPhone ||
      appointment?.patient?.phone ||
      null,

    doctorName:
      appointment?.doctorName ||
      appointment?.doctor?.name ||
      'Unassigned',

    doctorEmail:
      appointment?.doctorEmail ||
      appointment?.doctor?.email ||
      null,

    uniqueDoctorId:
      appointment?.uniqueDoctorId ||
      appointment?.doctor?.doctorProfile?.uniqueDoctorId ||
      null,

    specialization:
      appointment?.specialization ||
      appointment?.doctor?.doctorProfile?.specialization ||
      null,

    dutyStatus:
      appointment?.dutyStatus ||
      appointment?.doctor?.doctorProfile?.dutyStatus ||
      null,

    surgeryName:
      appointment?.surgeryName ||
      appointment?.surgery?.surgeryName ||
      'Not recorded',

    surgeryStatus:
      appointment?.surgeryStatus ||
      appointment?.surgery?.status ||
      null,

    isClash:
      appointment?.isClash === true ||
      appointment?.hasClash === true ||
      Number(appointment?.clashCount || 0) > 0,
  }));
}

const STATUS_FILTERS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Display only: 'home_visit' -> 'Home visit'. Never used for comparisons.
function humanize(value) {
  if (!value || typeof value !== 'string') return value;
  const spaced = value.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function dayParts(date) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return { weekday: '', day: '', month: date };
  return {
    weekday: parsed.toLocaleDateString([], { weekday: 'short' }),
    day: parsed.getDate(),
    month: parsed.toLocaleDateString([], { month: 'short', year: 'numeric' }),
  };
}

function statusVariant(appointment) {
  if (appointment?.isClash) return 'danger';
  if (appointment?.status === 'completed') return 'forest';
  if (appointment?.status === 'cancelled') return 'neutral';

  return 'amber';
}

function to24Hour(value) {
  const trimmed = typeof value === 'string' ? value.trim().toUpperCase() : '';
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!match) return '';
  let hour = Number(match[1]);
  const minute = match[2];
  const period = match[3];
  if (hour < 1 || hour > 12 || Number(minute) > 59) return '';
  if (period === 'AM' && hour === 12) hour = 0;
  if (period === 'PM' && hour !== 12) hour += 12;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

function formatSlotTimeLabel(time24) {
  const match = /^(\d{2}):(\d{2})$/.exec(time24 || '');
  if (!match) return time24 || '';
  let hour = Number(match[1]);
  const minute = match[2];
  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${period}`;
}

function todayISO() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function SlotTimesPanel() {
  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(todayISO);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newTime, setNewTime] = useState('9:00 AM');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adminService
      .getDoctors()
      .then((res) => {
        const data = res?.data;
        const list = Array.isArray(data) ? data : Array.isArray(data?.doctors) ? data.doctors : [];
        const active = list.filter((doctor) => doctor?.isActive !== false);
        if (cancelled) return;
        setDoctors(active);
        setDoctorId((current) => current || active[0]?.id || '');
        if (!active.length) setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(apiErrorMessage(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    if (!doctorId || !date) return;
    setError('');
    setLoading(true);
    try {
      const res = await adminService.getSlotTimes(doctorId, date);
      const list = Array.isArray(res?.data?.slots) ? res.data.slots : [];
      setSlots(list.filter((slot) => slot.isActive !== false));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [doctorId, date]);

  useEffect(() => {
    load();
  }, [load]);

  async function addSlot(event) {
    event.preventDefault();
    const time24 = to24Hour(newTime);
    if (!time24) {
      setError('Enter a valid time.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await adminService.addSlotTime(doctorId, date, time24);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeSlot(slot) {
    setError('');
    try {
      await adminService.removeSlotTime(slot.id);
      setSlots((current) => current.filter((item) => item.id !== slot.id));
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  const doctorName = doctors.find((doctor) => doctor.id === doctorId)?.name || 'this doctor';

  if (!loading && doctors.length === 0 && !error) {
    return (
      <div className="admin-slot-body">
        <EmptyState title="No active doctors" subtitle="Add a doctor first, then publish their appointment times here." />
      </div>
    );
  }

  return (
    <div className="admin-slot-body">
      {error ? <Alert variant="danger" className="mb-3">{error}</Alert> : null}

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="field-label">Doctor</span>
          <select
            className="field-select admin-inline-select"
            value={doctorId}
            onChange={(event) => setDoctorId(event.target.value)}
          >
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="field-label">Day</span>
          <input
            type="date"
            className="field-input"
            value={date}
            min={todayISO()}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
      </div>

      {loading ? (
        <LoadingState label="Loading slot times…" />
      ) : (
        <>
          {slots.length === 0 ? (
            <EmptyState
              title={`No times for ${doctorName} on this day`}
              subtitle="Patients of this doctor can't book this day until you add times below."
            />
          ) : (
            <div className="flex flex-wrap gap-2 mb-4">
              {slots.map((slot) => (
                <Badge key={slot.id} variant="ink" className="flex items-center gap-2">
                  {formatSlotTimeLabel(slot.time)}
                  <button
                    type="button"
                    onClick={() => removeSlot(slot)}
                    aria-label={`Remove ${formatSlotTimeLabel(slot.time)} slot`}
                    className="ml-1 text-[var(--color-crimson)] hover:opacity-70"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <form onSubmit={addSlot} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="field-label">Add a time</span>
              <AlarmTimePicker value={newTime} onChange={setNewTime} />
            </label>
            <Button type="submit" variant="primary" loading={saving} disabled={!doctorId || !date}>Add slot</Button>
          </form>
        </>
      )}
    </div>
  );
}

export default function AdminAppointments() {
  const [appointments, setAppointments] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('upcoming');
  const [doctorFilter, setDoctorFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { subscribe } = useRealtime();

  const load = useCallback(
    async ({ background = false } = {}) => {
      setError('');

      if (!background) setLoading(true);

      try {
        const res = await adminService.getAppointments();

        const normalized = normalizeAppointments(res?.data);

        setAppointments(normalized);

      } catch (err) {
        setError(apiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const cleanups = APPOINTMENT_REALTIME_EVENTS.map(
      (eventName) =>
        subscribe(eventName, () =>
          load({ background: true }),
        ),
    );

    return () =>
      cleanups.forEach((cleanup) => cleanup());
  }, [subscribe, load]);

  const doctors = useMemo(
    () =>
      Array.from(
        new Set(
          (appointments || [])
            .map((item) => item?.doctorName)
            .filter(Boolean),
        ),
      ).sort(),
    [appointments],
  );

  const clashCount = useMemo(
    () =>
      (appointments || []).filter(
        (item) => item?.isClash,
      ).length,
    [appointments],
  );

  const upcomingCount = useMemo(
    () =>
      (appointments || []).filter(
        (item) => item?.status === 'upcoming',
      ).length,
    [appointments],
  );

  // The calendar only lists days that have appointments for the chosen status
  // and doctor, so a completed day never shows up under "Upcoming".
  const forCalendar = useMemo(
    () =>
      (appointments || []).filter(
        (item) =>
          item?.status === statusFilter &&
          (doctorFilter === 'all' || item?.doctorName === doctorFilter),
      ),
    [appointments, statusFilter, doctorFilter],
  );

  const dates = useMemo(
    () => Array.from(new Set(forCalendar.map((item) => item?.date).filter(Boolean))).sort(),
    [forCalendar],
  );

  const today = todayISO();
  const activeDate = dates.includes(selectedDate)
    ? selectedDate
    : dates.find((date) => date >= today) || dates[0] || '';

  const visible = useMemo(
    () =>
      (appointments || [])
        .filter(
          (item) =>
            !activeDate ||
            item?.date === activeDate,
        )
        .filter((item) => item?.status === statusFilter)
        .filter(
          (item) =>
            doctorFilter === 'all' ||
            item?.doctorName === doctorFilter,
        )
        .filter((item) => {
          const haystack = [
            item?.patientName,
            item?.doctorName,
            item?.serviceType,
            item?.visitCategory,
            item?.surgeryName,
            item?.bloodGroup,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return (
            !query ||
            haystack.includes(query.toLowerCase())
          );
        })
        .sort((a, b) =>
          `${a?.date || ''} ${a?.time || ''}`.localeCompare(
            `${b?.date || ''} ${b?.time || ''}`,
          ),
        ),
    [
      appointments,
      activeDate,
      statusFilter,
      doctorFilter,
      query,
    ],
  );

  const clashAppointments = visible.filter(
    (item) => item?.isClash,
  );

  return (
    <DashboardShell>
      <div className="admin-appointments-page">
        <PageHeader
          title="Master Appointment Calendar"
          subtitle="Review every appointment, spot schedule clashes, and move conflicting bookings to a free slot."
        />

        {error ? (
          <div
            className="mb-6"
            aria-live="assertive"
          >
            <Alert
              variant="danger"
              title="Calendar unavailable"
            >
              {error}
            </Alert>
          </div>
        ) : null}

        {loading && !appointments ? (
          <LoadingState label="Loading the master appointment calendar…" />
        ) : (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
              <StatCard
                label="All appointments" icon={<NavIcon name={'calendar'} size={44} />}
                value={appointments?.length || 0}
                detail="Facility-wide schedule"
                accent="crimson"
              />

              <StatCard
                label="Upcoming" icon={<NavIcon name={'clock'} size={44} />}
                value={upcomingCount}
                detail="Appointments still scheduled"
                accent="gold"
              />

              <StatCard
                label="Clashes" icon={<NavIcon name={clashCount > 0 ? 'alert' : 'check'} size={44} />}
                value={clashCount}
                detail={
                  clashCount
                    ? 'Requires review'
                    : 'No conflicts detected'
                }
                accent={clashCount > 0 ? 'danger' : 'forest'}
              />

              <StatCard
                label="Visible now" icon={<NavIcon name={'search'} size={44} />}
                value={visible.length}
                detail="Matches current filters"
                accent="sand"
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[240px_minmax(0,1fr)] gap-5">
              <Panel
                title="Calendar"
                subtitle="Choose an appointment day."
              >
                <div
                  className="space-y-2"
                  aria-label="Appointment dates"
                >
                  {dates.length === 0 ? (
                    <EmptyState
                      title="No days to show"
                      subtitle={`There are no ${statusFilter} appointments.`}
                    />
                  ) : (
                    dates.map((date) => {
                      const parts = dayParts(date);
                      const dayCount = forCalendar.filter(
                        (item) => item?.date === date,
                      ).length;
                      const hasClash = forCalendar.some(
                        (item) => item?.date === date && item?.isClash,
                      );

                      return (
                        <button
                          type="button"
                          key={date}
                          className={`admin-day ${
                            activeDate === date ? 'is-active' : ''
                          }`}
                          onClick={() =>
                            setSelectedDate(date)
                          }
                          aria-pressed={
                            activeDate === date
                          }
                        >
                          <span className="admin-day-block" aria-hidden="true">
                            <span>{parts.weekday}</span>
                            <strong>{parts.day}</strong>
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-[var(--color-ink)]">
                              {formatDate(date)}
                            </span>

                            <span className="block text-xs text-[var(--color-text-soft)] mt-0.5">
                              {dayCount} appointment{dayCount === 1 ? '' : 's'}
                            </span>
                          </span>

                          {hasClash ? (
                            <span className="admin-day-clash" role="img" aria-label="Has a schedule clash" />
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </Panel>

              <div className="space-y-6">
                <Panel>
                  <div className="admin-toolbar">
                    <div className="admin-search">
                      <label
                        className="sr-only"
                        htmlFor="appointment-search"
                      >
                        Search schedule
                      </label>

                      <input
                        id="appointment-search"
                        className="field-input"
                        value={query}
                        onChange={(event) =>
                          setQuery(event.target.value)
                        }
                        placeholder="Search patient, doctor, surgery"
                      />
                    </div>

                    <div
                      className="admin-chips"
                      role="group"
                      aria-label="Filter by status"
                    >
                      {STATUS_FILTERS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`admin-chip ${
                            statusFilter === option.value
                              ? 'is-active'
                              : ''
                          }`}
                          aria-pressed={statusFilter === option.value}
                          onClick={() =>
                            setStatusFilter(option.value)
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    <select
                      id="appointment-doctor"
                      className="field-select admin-inline-select"
                      aria-label="Filter by doctor"
                      value={doctorFilter}
                      onChange={(event) =>
                        setDoctorFilter(event.target.value)
                      }
                    >
                      <option value="all">
                        All doctors
                      </option>

                      {doctors.map((doctor) => (
                        <option
                          key={doctor}
                          value={doctor}
                        >
                          {doctor}
                        </option>
                      ))}
                    </select>
                  </div>

                  {clashAppointments.length ? (
                    <div
                      className="mt-4"
                      aria-live="polite"
                    >
                      <Alert
                        variant="danger"
                        title={`${
                          clashAppointments.length
                        } clash${
                          clashAppointments.length === 1
                            ? ''
                            : 'es'
                        } in this view`}
                      >
                        Review the marked bookings and use
                        Resolve to move a conflicting
                        appointment to a free time.
                      </Alert>
                    </div>
                  ) : null}

                  <div className="admin-panel-divider" />

                  <SectionHeading
                    title={
                      activeDate
                        ? formatDate(activeDate)
                        : 'All scheduled appointments'
                    }
                    subtitle={`${visible.length} appointment${
                      visible.length === 1
                        ? ''
                        : 's'
                    } shown`}
                  />

                  {visible.length === 0 ? (
                    <EmptyState
                      title="No appointments match this view"
                      subtitle="Try another date, status, doctor, or search term."
                      action={
                        query ||
                        statusFilter !== 'upcoming' ||
                        doctorFilter !== 'all' ? (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setQuery('');
                              setStatusFilter('upcoming');
                              setDoctorFilter('all');
                            }}
                          >
                            Clear filters
                          </Button>
                        ) : null
                      }
                    />
                  ) : (
                    <div
                      className="overflow-x-auto"
                      role="region"
                      aria-label="Master appointment schedule"
                      tabIndex="0"
                    >
                      <table className="w-full text-sm min-w-[960px]">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-text-soft)] border-b border-[var(--color-line)]">
                            <th className="pb-3 pr-4">
                              Time
                            </th>

                            <th className="pb-3 pr-4">
                              Patient
                            </th>

                            <th className="pb-3 pr-4">
                              Doctor
                            </th>

                            <th className="pb-3 pr-4">
                              Surgery
                            </th>

                            <th className="pb-3 pr-4">
                              Visit
                            </th>

                            <th className="pb-3 pr-4">
                              Status
                            </th>

                            <th className="pb-3 text-right">
                              Action
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {visible.map((item) => (
                            <tr
                              key={item.id}
                              className={`border-b border-[var(--color-line)] last:border-0 ${
                                item.isClash
                                  ? 'bg-[var(--color-danger-soft)]'
                                  : ''
                              }`}
                            >
                              <td className="py-4 pr-4 font-semibold text-[var(--color-ink)]">
                                {item.time || '—'}
                              </td>

                              <td className="py-4 pr-4">
                                <div className="font-semibold">
                                  {item.patientName ||
                                    'Unknown patient'}
                                </div>

                                <div className="text-xs text-[var(--color-text-soft)]">
                                  {item.bloodGroup
                                    ? `Blood group ${item.bloodGroup}`
                                    : 'Blood group not recorded'}
                                </div>
                              </td>

                              <td className="py-4 pr-4">
                                <div>
                                  {item.doctorName ||
                                    'Unassigned'}
                                </div>

                                {item.uniqueDoctorId ? (
                                  <div className="text-xs text-[var(--color-text-soft)]">
                                    {item.uniqueDoctorId}
                                  </div>
                                ) : null}
                              </td>

                              <td className="py-4 pr-4 text-[var(--color-text-soft)]">
                                {item.surgeryName ||
                                  'Not recorded'}
                              </td>

                              <td className="py-4 pr-4">
                                <div>
                                  {humanize(item.visitCategory) ||
                                    '—'}
                                </div>

                                <div className="text-xs text-[var(--color-text-soft)]">
                                  {humanize(item.serviceType) ||
                                    '—'}
                                </div>
                              </td>

                              <td className="py-4 pr-4">
                                <Badge
                                  variant={statusVariant(
                                    item,
                                  )}
                                >
                                  {item.isClash
                                    ? 'Clash'
                                    : humanize(item.status) ||
                                      'Unknown'}
                                </Badge>
                              </td>

                              <td className="py-4 text-right">
                                {item.status === 'upcoming' ? (
                                  <Button
                                    variant={
                                      item.isClash
                                        ? 'danger'
                                        : 'outline'
                                    }
                                    onClick={() =>
                                      setEditing(item)
                                    }
                                  >
                                    {item.isClash
                                      ? 'Resolve'
                                      : 'Reschedule'}
                                  </Button>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              </div>
            </div>
          </>
        )}

        <details className="admin-disclosure panel">
          <summary>
            <span className="admin-disclosure-title">Appointment slot times</span>
            <span className="admin-disclosure-hint">
              The times patients can book — set per doctor, per day
            </span>
          </summary>

          <div className="admin-disclosure-body">
            <p className="admin-disclosure-note">
              Pick a doctor and a day, then add the times patients can book with that doctor on that day only. A day with no times can't be booked.
            </p>

            <SlotTimesPanel />
          </div>
        </details>

        <RescheduleModal
          appt={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            load({ background: true });
          }}
        />
      </div>
    </DashboardShell>
  );
}

function RescheduleModal({
  appt,
  onClose,
  onDone,
}) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (appt) {
      setDate(appt.date || '');
      setTime(appt.time || '');
      setError('');
    }
  }, [appt]);

  async function handleSubmit(event) {
    event.preventDefault();

    setError('');
    setSaving(true);

    try {
      await adminService.rescheduleAppointment(
        appt.id,
        {
          date,
          time,
        },
      );

      onDone();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!appt}
      title={
        appt?.isClash
          ? 'Resolve Schedule Conflict'
          : 'Reschedule Appointment'
      }
      onClose={onClose}
    >
      {appt ? (
        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-muted)] p-4">
            <div className="text-sm font-semibold text-[var(--color-ink)]">
              {appt.patientName || 'Patient'}
            </div>

            <div className="text-sm text-[var(--color-text-soft)] mt-1">
              {appt.doctorName || 'Doctor'} ·{' '}
              {appt.serviceType ||
                appt.visitCategory ||
                'Appointment'}
            </div>

            {appt.surgeryName ? (
              <div className="text-xs text-[var(--color-muted)] mt-2">
                {appt.surgeryName}
              </div>
            ) : null}
          </div>

          <div>
            <label
              className="field-label"
              htmlFor="admin-reschedule-date"
            >
              New date
            </label>

            <input
              id="admin-reschedule-date"
              type="date"
              required
              className="field-input"
              value={date}
              onChange={(event) =>
                setDate(event.target.value)
              }
            />
          </div>

          <div>
            <label
              className="field-label"
              htmlFor="admin-reschedule-time"
            >
              New time
            </label>

            <input
              id="admin-reschedule-time"
              type="time"
              required
              className="field-input"
              value={time}
              onChange={(event) =>
                setTime(event.target.value)
              }
            />
          </div>

          {error ? (
            <Alert
              variant="danger"
              title="Reschedule not completed"
            >
              {error}
            </Alert>
          ) : null}

          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              variant={
                appt.isClash
                  ? 'danger'
                  : 'primary'
              }
              loading={saving}
            >
              {appt.isClash
                ? 'Resolve and Save'
                : 'Save New Time'}
            </Button>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}