// Phase 2.12.3 — Admin Master Appointment Calendar & Clash Resolution UX
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
} from '../../components/ui';
import { apiErrorMessage } from '../../api/client';
import { useRealtime } from '../../context/RealtimeContext';
import { APPOINTMENT_REALTIME_EVENTS } from '../../config/realtimeEvents';

function parseTimestamp(appointment) {
  const raw = `${appointment?.date || ''}T${appointment?.time || '00:00'}`;
  const value = new Date(raw);

  return Number.isNaN(value.getTime()) ? null : value;
}

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

function SlotTimesPanel() {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newTime, setNewTime] = useState('9:00 AM');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await adminService.getSlotTimes();
      const list = Array.isArray(res?.data?.slots) ? res.data.slots : [];
      setSlots(list.filter((slot) => slot.isActive !== false));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

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
      await adminService.addSlotTime(time24);
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

  return (
    <Panel
      title="Appointment slot times"
      subtitle="These fixed times of day are the only ones patients can choose from when booking. Add or remove slots here to control how many appointments can be scheduled and when."
      className="mb-6"
    >
      {error ? <Alert variant="danger" className="mb-3">{error}</Alert> : null}
      {loading ? (
        <LoadingState label="Loading slot times…" />
      ) : (
        <>
          {slots.length === 0 ? (
            <EmptyState title="No slot times configured yet" subtitle="Add at least one time below so patients have something to book into." />
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
              <span className="field-label">Add a new slot time</span>
              <AlarmTimePicker value={newTime} onChange={setNewTime} />
            </label>
            <Button type="submit" variant="primary" loading={saving}>+ Add slot</Button>
          </form>
        </>
      )}
    </Panel>
  );
}

export default function AdminAppointments() {
  const [appointments, setAppointments] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [doctorFilter, setDoctorFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const { subscribe } = useRealtime();

  const load = useCallback(
    async ({ background = false } = {}) => {
      setError('');

      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const res = await adminService.getAppointments();

        const normalized = normalizeAppointments(res?.data);

        setAppointments(normalized);

        if (!selectedDate && normalized.length) {
          const upcoming = normalized.find(
            (item) =>
              item?.status === 'upcoming' &&
              parseTimestamp(item),
          );

          setSelectedDate(
            upcoming?.date ||
              normalized[0]?.date ||
              '',
          );
        }
      } catch (err) {
        setError(apiErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedDate],
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

  const dates = useMemo(() => {
    const list = Array.from(
      new Set(
        (appointments || [])
          .map((item) => item?.date)
          .filter(Boolean),
      ),
    );

    return list.sort();
  }, [appointments]);

  const visible = useMemo(
    () =>
      (appointments || [])
        .filter(
          (item) =>
            !selectedDate ||
            item?.date === selectedDate,
        )
        .filter(
          (item) =>
            statusFilter === 'all' ||
            item?.status === statusFilter,
        )
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
      selectedDate,
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
          eyebrow="Facility scheduling"
          title="Master Appointment Calendar"
          subtitle="Review every appointment, identify schedule clashes, and move conflicting bookings to a free slot while keeping the hospital schedule coherent."
          action={(
            <Button
              variant="outline"
              onClick={() =>
                load({ background: true })
              }
              loading={refreshing}
            >
              Refresh calendar
            </Button>
          )}
        />

        <SlotTimesPanel />

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
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
              <CalendarStat
                label="All appointments"
                value={appointments?.length || 0}
                detail="Facility-wide schedule"
              />

              <CalendarStat
                label="Upcoming"
                value={upcomingCount}
                detail="Appointments still scheduled"
              />

              <CalendarStat
                label="Clashes"
                value={clashCount}
                detail={
                  clashCount
                    ? 'Requires review'
                    : 'No conflicts detected'
                }
                critical={clashCount > 0}
              />

              <CalendarStat
                label="Visible now"
                value={visible.length}
                detail="Matches current filters"
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-6">
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
                      title="No dates available"
                      subtitle="Appointments will appear here once scheduled."
                    />
                  ) : (
                    dates.map((date) => (
                      <button
                        type="button"
                        key={date}
                        className={`w-full text-left rounded-xl border px-3 py-3 transition ${
                          selectedDate === date
                            ? 'border-[var(--color-gold)] bg-[var(--color-gold-soft)]'
                            : 'border-[var(--color-line)] hover:border-[var(--color-gold)]'
                        }`}
                        onClick={() =>
                          setSelectedDate(date)
                        }
                        aria-pressed={
                          selectedDate === date
                        }
                      >
                        <span className="block text-sm font-semibold text-[var(--color-ink)]">
                          {formatDate(date)}
                        </span>

                        <span className="block text-xs text-[var(--color-text-soft)] mt-1">
                          {
                            appointments.filter(
                              (item) =>
                                item?.date === date,
                            ).length
                          }{' '}
                          appointment(s)
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </Panel>

              <div className="space-y-6">
                <Panel>
                  <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_0.7fr_0.7fr] gap-4">
                    <div>
                      <label
                        className="field-label"
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
                        placeholder="Patient, doctor, surgery, or service"
                      />
                    </div>

                    <div>
                      <label
                        className="field-label"
                        htmlFor="appointment-status"
                      >
                        Status
                      </label>

                      <select
                        id="appointment-status"
                        className="field-input"
                        value={statusFilter}
                        onChange={(event) =>
                          setStatusFilter(
                            event.target.value,
                          )
                        }
                      >
                        <option value="all">
                          All statuses
                        </option>

                        <option value="upcoming">
                          Upcoming
                        </option>

                        <option value="completed">
                          Completed
                        </option>

                        <option value="cancelled">
                          Cancelled
                        </option>
                      </select>
                    </div>

                    <div>
                      <label
                        className="field-label"
                        htmlFor="appointment-doctor"
                      >
                        Doctor
                      </label>

                      <select
                        id="appointment-doctor"
                        className="field-input"
                        value={doctorFilter}
                        onChange={(event) =>
                          setDoctorFilter(
                            event.target.value,
                          )
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
                </Panel>

                <Panel>
                  <SectionHeading
                    title={
                      selectedDate
                        ? formatDate(selectedDate)
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
                        statusFilter !== 'all' ||
                        doctorFilter !== 'all' ? (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setQuery('');
                              setStatusFilter('all');
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
                                  {item.visitCategory ||
                                    '—'}
                                </div>

                                <div className="text-xs text-[var(--color-text-soft)]">
                                  {item.serviceType ||
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
                                    : item.status ||
                                      'Unknown'}
                                </Badge>
                              </td>

                              <td className="py-4 text-right">
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

function CalendarStat({
  label,
  value,
  detail,
  critical = false,
}) {
  return (
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-[0.14em] text-[var(--color-text-soft)]">
        {label}
      </div>

      <div
        className={`mt-2 font-display text-3xl ${
          critical
            ? 'text-[var(--color-danger)]'
            : 'text-[var(--color-ink)]'
        }`}
      >
        {value}
      </div>

      <div className="mt-1 text-xs text-[var(--color-muted)]">
        {detail}
      </div>
    </div>
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