/* PHASE 2.7.8 — Appointment accessibility & responsive hardening */
/* PHASE 2.7.7 — Appointment reschedule & cancellation UX */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRealtime } from '../../context/RealtimeContext';
import { APPOINTMENT_REALTIME_EVENTS } from '../../config/realtimeEvents';
import PatientDashboardShell from '../../components/PatientDashboardShell';
import {
  Alert,
  Badge,
  Button,
  ConfirmModal,
  EmptyState,
  LoadingState,
  Modal,
  Panel,
  PageHeader,
  SectionHeading,
} from '../../components/ui';
import { patientService } from '../../api/services/patient';
import { apiErrorMessage } from '../../api/client';

const HOME_SERVICES = [
  { value: 'Dressing', label: 'Dressing', description: 'Post-surgical wound or dressing care at home.' },
  { value: 'Physiotherapy', label: 'Physiotherapy', description: 'Guided rehabilitation support at home.' },
  { value: 'Vitals Check', label: 'Vitals Check', description: 'A clinician checks your monitored vital signs at home.' },
];

const HOSPITAL_SERVICES = [
  { value: 'Doctor Visit', label: 'Doctor Visit', description: 'In-person consultation with your care team.' },
  { value: 'Pharmacy Visit', label: 'Pharmacy Visit', description: 'Visit the hospital pharmacy for prescribed medicines.' },
];

const VISIT_OPTIONS = [
  {
    value: 'home_visit',
    label: 'Home Visit',
    kicker: 'Care at home',
    description: 'A clinician comes to you for dressing, physiotherapy, or a vitals check.',
    icon: '⌂',
  },
  {
    value: 'hospital_visit',
    label: 'Hospital Visit',
    kicker: 'Care at hospital',
    description: 'Visit the hospital for a doctor consultation or pharmacy pickup.',
    icon: '✚',
  },
];

const STATUS_VARIANT = { upcoming: 'gold', completed: 'forest', cancelled: 'danger' };
const STATUS_LABEL = { upcoming: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled' };
const STEP_LABELS = ['Visit type', 'Service', 'Date & time', 'Review'];
const STEP_TITLES = {
  1: 'Choose a visit type',
  2: 'Choose a service',
  3: 'Choose a date and time',
  4: 'Review your appointment',
};

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return 'Not selected';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(value) {
  if (!value) return 'Not selected';
  const [hours, minutes] = String(value).split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return value;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function doctorLabel(name) {
  if (!name) return 'Care team';
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
}

export default function PatientAppointments() {
  const { subscribe } = useRealtime();
  const [appointments, setAppointments] = useState(null);
  const [tab, setTab] = useState('upcoming');
  const [showWizard, setShowWizard] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [rescheduleAppointment, setRescheduleAppointment] = useState(null);
  const [cancelAppointment, setCancelAppointment] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  async function load() {
    setLoadError('');
    try {
      const res = await patientService.getAppointments();
      setAppointments(Array.isArray(res.data.appointments) ? res.data.appointments : []);
    } catch (error) {
      setLoadError(error.response?.data?.error || 'Could not load appointments. Please try again.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const cleanups = APPOINTMENT_REALTIME_EVENTS.map((eventName) =>
      subscribe(eventName, () => load()),
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [subscribe]);

  const visible = useMemo(() => {
    const filtered = (appointments || []).filter((appointment) => (
      tab === 'upcoming' ? appointment.status === 'upcoming' : appointment.status !== 'upcoming'
    ));

    return [...filtered].sort((a, b) => {
      const first = new Date(`${a.date || ''}T${a.time || '00:00'}`).getTime();
      const second = new Date(`${b.date || ''}T${b.time || '00:00'}`).getTime();
      if (Number.isNaN(first) || Number.isNaN(second)) return 0;
      return tab === 'upcoming' ? first - second : second - first;
    });
  }, [appointments, tab]);

  async function handleReschedule({ date, time }) {
    if (!rescheduleAppointment) return;
    setActionBusy(true);
    setActionError('');
    try {
      await patientService.rescheduleAppointment(rescheduleAppointment.id, { date, time });
      setRescheduleAppointment(null);
      await load();
    } catch (error) {
      setActionError(error.response?.data?.error || 'That appointment could not be rescheduled. No changes were made.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleCancel() {
    if (!cancelAppointment) return;
    setActionBusy(true);
    setActionError('');
    try {
      await patientService.cancelAppointment(cancelAppointment.id);
      setCancelAppointment(null);
      await load();
    } catch (error) {
      setActionError(error.response?.data?.error || 'That appointment could not be cancelled. No changes were made.');
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <PatientDashboardShell>
      <PageHeader
        eyebrow="Patient appointments"
        title="Appointments"
        subtitle="Book, review, and track your visits during recovery."
        action={<Button variant="primary" onClick={() => setShowWizard(true)}>+ Book Appointment</Button>}
      />

      <div className="flex flex-wrap gap-2 mb-5" role="tablist" aria-label="Appointment history views" onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 'upcoming' : event.key === 'End' ? 'past' : event.key === 'ArrowRight' ? 'past' : 'upcoming';
        setTab(next);
        document.getElementById(`appointments-tab-${next}`)?.focus();
      }}>
        <button
          type="button"
          role="tab"
          id="appointments-tab-upcoming"
          aria-controls="appointments-panel"
          aria-selected={tab === 'upcoming'}
          onClick={() => setTab('upcoming')}
          className={`btn ${tab === 'upcoming' ? 'btn-primary' : 'btn-outline'}`}
          tabIndex={tab === 'upcoming' ? 0 : -1}
        >
          Upcoming
        </button>
        <button
          type="button"
          role="tab"
          id="appointments-tab-past"
          aria-controls="appointments-panel"
          aria-selected={tab === 'past'}
          onClick={() => setTab('past')}
          className={`btn ${tab === 'past' ? 'btn-primary' : 'btn-outline'}`}
          tabIndex={tab === 'past' ? 0 : -1}
        >
          Past
        </button>
      </div>

      <Panel>
        {loadError ? (
          <Alert variant="danger" title="Appointments unavailable">
            <div className="space-y-3">
              <p>{loadError}</p>
              <Button variant="outline" onClick={load}>Retry</Button>
            </div>
          </Alert>
        ) : !appointments ? (
          <LoadingState label="Loading appointments…" />
        ) : visible.length === 0 ? (
          <EmptyState
            title={tab === 'upcoming' ? 'No upcoming appointments' : 'No past appointments'}
            description={tab === 'upcoming' ? 'Book a visit for your recovery plan when you are ready.' : 'Completed and cancelled visits will appear here.'}
            action={tab === 'upcoming' ? <Button variant="primary" onClick={() => setShowWizard(true)}>Book Appointment</Button> : undefined}
          />
        ) : (
          <div
            id="appointments-panel"
            className="space-y-3"
            role="tabpanel"
            aria-labelledby={`appointments-tab-${tab === 'upcoming' ? 'upcoming' : 'past'}`}
            tabIndex={0}
          >
            {visible.map((appointment) => (
              <article key={appointment.id} className={`appointment-list-card appointment-list-card--${appointment.status || 'unknown'}`}>
                <div className="appointment-list-date">
                  <span>{formatDate(appointment.date)}</span>
                  <strong>{formatTime(appointment.time)}</strong>
                </div>
                <div className="appointment-list-copy">
                  <p className="font-semibold text-[var(--color-ink)]">{doctorLabel(appointment.doctorName)}</p>
                  <p className="text-sm text-[var(--color-text-soft)]">
                    {appointment.specialization || 'Care team'} · {appointment.visitCategory === 'home_visit' ? 'Home Visit' : 'Hospital Visit'} · {appointment.serviceType}
                  </p>
                  <p className="appointment-list-history-note">
                    {appointment.status === 'completed' ? 'This visit is part of your appointment history.' : appointment.status === 'cancelled' ? 'This appointment was cancelled and remains in your history.' : 'Scheduled during your current care episode.'}
                  </p>
                </div>
                <div className="appointment-list-actions">
                  <Badge variant={STATUS_VARIANT[appointment.status] || 'neutral'}>{STATUS_LABEL[appointment.status] || 'Recorded'}</Badge>
                  {appointment.status === 'upcoming' ? (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setActionError(''); setRescheduleAppointment(appointment); }}>Reschedule</Button>
                      <Button variant="ghost" size="sm" onClick={() => { setActionError(''); setCancelAppointment(appointment); }}>Cancel</Button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      {actionError ? (
        <div className="mb-5" role="alert" aria-live="assertive">
          <Alert variant="danger" title="Appointment update failed">{actionError}</Alert>
        </div>
      ) : null}

      <BookingWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onBooked={() => { setShowWizard(false); load(); }}
      />
      <RescheduleAppointmentModal
        open={Boolean(rescheduleAppointment)}
        appointment={rescheduleAppointment}
        busy={actionBusy}
        onCancel={() => { if (!actionBusy) setRescheduleAppointment(null); }}
        onSubmit={handleReschedule}
      />
      <ConfirmModal
        open={Boolean(cancelAppointment)}
        title="Cancel this appointment?"
        eyebrow="Appointment cancellation"
        body={cancelAppointment ? `This will cancel the ${cancelAppointment.serviceType || 'scheduled'} appointment on ${formatDate(cancelAppointment.date)} at ${formatTime(cancelAppointment.time)}. The cancellation will remain visible in appointment history.` : ''}
        confirmLabel={actionBusy ? 'Cancelling…' : 'Cancel Appointment'}
        confirmDisabled={actionBusy}
        onConfirm={handleCancel}
        onCancel={() => { if (!actionBusy) setCancelAppointment(null); }}
        variant="danger"
      />
    </PatientDashboardShell>
  );
}

function BookingWizard({ open, onClose, onBooked }) {
  const [step, setStep] = useState(1);
  const [visitCategory, setVisitCategory] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scheduleTouched, setScheduleTouched] = useState(false);
  const [confirmationAcknowledged, setConfirmationAcknowledged] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(null);
  const [dateWindowStart, setDateWindowStart] = useState(0);
  const [availableSlots, setAvailableSlots] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const firstStepFocus = useRef(null);
  const today = todayIso();

  const upcomingDates = useMemo(() => {
    const days = [];
    for (let i = 0; i < 21; i += 1) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      days.push({
        iso: d.toISOString().slice(0, 10),
        day: d.toLocaleDateString([], { day: '2-digit' }),
        month: d.toLocaleDateString([], { month: 'short' }).toUpperCase(),
        weekday: d.toLocaleDateString([], { weekday: 'short' }).toUpperCase(),
      });
    }
    return days;
  }, []);

  const visibleDates = upcomingDates.slice(dateWindowStart, dateWindowStart + 4);

  useEffect(() => {
    if (!date) {
      setAvailableSlots(null);
      return undefined;
    }
    let cancelled = false;
    setSlotsLoading(true);
    setSlotsError('');
    patientService.getAvailableSlots(date)
      .then((res) => {
        if (!cancelled) setAvailableSlots(Array.isArray(res?.data?.slots) ? res.data.slots : []);
      })
      .catch((err) => {
        if (!cancelled) setSlotsError(apiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => { cancelled = true; };
  }, [date]);

  const services = visitCategory === 'home_visit' ? HOME_SERVICES : HOSPITAL_SERVICES;
  const selectedService = services.find((service) => service.value === serviceType);

  function reset() {
    setStep(1);
    setVisitCategory('');
    setServiceType('');
    setDate(todayIso());
    setTime('');
    setError('');
    setBusy(false);
    setScheduleTouched(false);
    setConfirmationAcknowledged(false);
    setBookingSuccess(null);
    setDateWindowStart(0);
    setAvailableSlots(null);
    setSlotsError('');
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  function goToStep(nextStep) {
    setError('');
    if (nextStep < 4) setConfirmationAcknowledged(false);
    setStep(nextStep);
  }

  function chooseVisit(category) {
    setVisitCategory(category);
    setServiceType('');
    setError('');
    setStep(2);
  }

  function chooseService(value) {
    setServiceType(value);
    setError('');
    setStep(3);
  }

  function validateSchedule() {
    if (!date || !time) {
      setError('Select both a date and a time to continue.');
      return false;
    }

    if (date < today) {
      setError('Please choose today or a future date.');
      return false;
    }

    if (date === today) {
      const [hours, minutes] = time.split(':').map(Number);
      const selected = new Date();
      selected.setHours(hours, minutes, 0, 0);
      if (selected.getTime() <= Date.now()) {
        setError('Please choose a future time for today.');
        return false;
      }
    }

    return true;
  }

  function handleDateChange(value) {
    setDate(value);
    setTime('');
    setScheduleTouched(false);
    setError('');
  }

  function handleTimeChange(value) {
    setTime(value);
    setScheduleTouched(true);
    setError('');
  }

  function continueToReview() {
    if (!validateSchedule()) return;
    setError('');
    setStep(4);
  }

  async function confirmBooking() {
    if (!validateSchedule() || !visitCategory || !serviceType || !confirmationAcknowledged) return;
    setBusy(true);
    setError('');
    try {
      const response = await patientService.bookAppointment({ visitCategory, serviceType, date, time });
      const appointment = response?.data?.appointment || response?.data || {};
      setBookingSuccess({
        date,
        time,
        visitCategory,
        serviceType,
        appointmentId: appointment.id || appointment.appointmentId || null,
      });
      setConfirmationAcknowledged(false);
    } catch (err) {
      const backendError = err.response?.data?.error;
      const conflict = /conflict|clash|already booked|unavailable|overlap|same time/i.test(String(backendError || ''));
      setError(conflict
        ? 'That time is no longer available. No appointment was created. Return to Date & time and choose another slot.'
        : (backendError || 'This appointment could not be booked. No appointment was created. Review the details and try again.'));
      if (conflict) {
        setStep(3);
        setConfirmationAcknowledged(false);
      }
    } finally {
      setBusy(false);
    }
  }

  function finishSuccess() {
    reset();
    onBooked();
  }

  if (bookingSuccess) {
    return (
      <Modal
        open={open}
        title="Appointment booked"
        eyebrow="Booking confirmed"
        description="Your appointment has been created successfully."
        width="max-w-xl"
        onClose={finishSuccess}
      >
        <div className="appointment-booking-success" role="status" aria-live="polite">
          <div className="appointment-booking-success__icon" aria-hidden="true">✓</div>
          <SectionHeading
            title="Your appointment is confirmed"
            description="Keep these details for your visit. The appointment will also appear in your Upcoming appointments list."
          />
          <div className="appointment-review-card appointment-booking-success__details" aria-label="Confirmed appointment details">
            <div><span>Visit type</span><strong>{bookingSuccess.visitCategory === 'home_visit' ? 'Home Visit' : 'Hospital Visit'}</strong></div>
            <div><span>Service</span><strong>{selectedService?.label || bookingSuccess.serviceType}</strong></div>
            <div><span>Date</span><strong>{formatDate(bookingSuccess.date)}</strong></div>
            <div><span>Time</span><strong>{formatTime(bookingSuccess.time)}</strong></div>
          </div>
          {bookingSuccess.appointmentId ? (
            <p className="text-xs text-[var(--color-text-soft)]">Appointment reference: <strong>{bookingSuccess.appointmentId}</strong></p>
          ) : null}
          <div className="appointment-booking-success__notice" role="note">
            <strong>Next step</strong>
            <p>Check your Upcoming appointments list for the saved booking. Arrive or be ready according to the visit type and service above.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="primary" onClick={finishSuccess}>Done</Button>
          </div>
        </div>
      </Modal>
    );
  }

  function renderStep() {
    if (step === 1) {
      return (
        <div className="space-y-3" ref={firstStepFocus}>
          <SectionHeading title={STEP_TITLES[1]} description="Choose where you would like the visit to take place." />
          <div className="appointment-choice-grid" role="list" aria-label="Visit type choices">
            {VISIT_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.value}
                onClick={() => chooseVisit(option.value)}
                className={`appointment-choice-card ${visitCategory === option.value ? 'is-selected' : ''}`}
                aria-pressed={visitCategory === option.value}
              >
                <span className="appointment-choice-icon" aria-hidden="true">{option.icon}</span>
                <span className="appointment-choice-copy">
                  <span className="appointment-choice-kicker">{option.kicker}</span>
                  <span className="font-semibold text-[var(--color-ink)]">{option.label}</span>
                  <span className="text-sm text-[var(--color-text-soft)]">{option.description}</span>
                </span>
                <span className="appointment-choice-arrow" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="space-y-3">
          <SectionHeading
            title={STEP_TITLES[2]}
            description={`Choose one ${visitCategory === 'home_visit' ? 'home-care' : 'hospital'} service.`}
          />
          <div className="appointment-selection-context" aria-label="Current visit type">
            <span className="appointment-choice-kicker">Visit type</span>
            <strong>{visitCategory === 'home_visit' ? 'Home Visit' : 'Hospital Visit'}</strong>
            <button type="button" className="appointment-change-link" onClick={() => goToStep(1)}>Change</button>
          </div>
          <div className="appointment-choice-grid appointment-choice-grid--services" role="list" aria-label="Service choices">
            {services.map((service) => (
              <button
                type="button"
                key={service.value}
                onClick={() => chooseService(service.value)}
                className={`appointment-choice-card ${serviceType === service.value ? 'is-selected' : ''}`}
                aria-pressed={serviceType === service.value}
              >
                <span className="appointment-choice-copy">
                  <span className="appointment-choice-kicker">{visitCategory === 'home_visit' ? 'Home service' : 'Hospital service'}</span>
                  <span className="font-semibold text-[var(--color-ink)]">{service.label}</span>
                  <span className="text-sm text-[var(--color-text-soft)]">{service.description}</span>
                </span>
                <span className="appointment-choice-arrow" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={() => goToStep(1)}>← Back</Button>
        </div>
      );
    }

    if (step === 3) {
      return (
        <div className="space-y-4">
          <SectionHeading title={STEP_TITLES[3]} description="Choose a date, then pick one of the available appointment times. These times are set by the hospital." />

          <div>
            <p className="field-label mb-2">Select Date</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDateWindowStart((current) => Math.max(0, current - 1))}
                disabled={dateWindowStart === 0}
                aria-label="Earlier dates"
                className="appointment-date-nav"
              >
                ‹
              </button>
              <div className="flex-1 grid grid-cols-4 gap-2">
                {visibleDates.map((d) => (
                  <button
                    type="button"
                    key={d.iso}
                    onClick={() => handleDateChange(d.iso)}
                    className={`appointment-date-chip ${date === d.iso ? 'is-selected' : ''}`}
                    aria-pressed={date === d.iso}
                  >
                    <span className="block text-xs font-semibold">{d.month} {d.day}</span>
                    <span className="block text-xs text-[var(--color-text-soft)]">{d.weekday}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setDateWindowStart((current) => Math.min(upcomingDates.length - 4, current + 1))}
                disabled={dateWindowStart >= upcomingDates.length - 4}
                aria-label="Later dates"
                className="appointment-date-nav"
              >
                ›
              </button>
            </div>
          </div>

          <div>
            <p className="field-label mb-2">Select Time</p>
            {slotsLoading ? (
              <LoadingState label="Loading available times…" />
            ) : slotsError ? (
              <Alert variant="danger" title="Could not load times">{slotsError}</Alert>
            ) : !availableSlots || availableSlots.length === 0 ? (
              <EmptyState title="No time slots configured" subtitle="The hospital has not published any appointment times yet. Please contact your care team." />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableSlots.map((slot) => (
                  <button
                    type="button"
                    key={slot.time}
                    disabled={!slot.available}
                    onClick={() => handleTimeChange(slot.time)}
                    className={`appointment-slot-chip ${time === slot.time ? 'is-selected' : ''} ${!slot.available ? 'is-unavailable' : ''}`}
                    aria-pressed={time === slot.time}
                  >
                    {formatTime(slot.time)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="appointment-slot-summary" aria-live="polite">
            {date && time ? (
              <><span>Selected slot</span><strong>{formatDate(date)} · {formatTime(time)}</strong></>
            ) : (
              <span>Select a date and time for your visit.</span>
            )}
          </div>
          {error ? <Alert variant="danger" title="Check the selected slot">{error}</Alert> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => goToStep(2)} disabled={busy}>← Back</Button>
            <Button variant="primary" className="flex-1" disabled={!date || !time || busy} onClick={continueToReview}>Continue</Button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <SectionHeading title={STEP_TITLES[4]} description="Confirm the details before booking." />
        <div className="appointment-review-card" aria-label="Appointment review">
          <div><span>Visit type</span><strong>{visitCategory === 'home_visit' ? 'Home Visit' : 'Hospital Visit'}</strong></div>
          <div><span>Service</span><strong>{selectedService?.label || serviceType}</strong></div>
          <div><span>Date</span><strong>{formatDate(date)}</strong></div>
          <div><span>Time</span><strong>{formatTime(time)}</strong></div>
        </div>
        <div className="appointment-review-notice" role="note">
          <strong>Before you confirm</strong>
          <p>Check the visit type, service, date, and time carefully. Appointment conflicts are enforced by CasterlyCare when the booking is submitted; a conflict will not create a duplicate appointment.</p>
        </div>
        <label className="appointment-confirm-check">
          <input
            type="checkbox"
            checked={confirmationAcknowledged}
            onChange={(event) => { setConfirmationAcknowledged(event.target.checked); setError(''); }}
            disabled={busy}
          />
          <span>I have reviewed these appointment details and want to submit this booking.</span>
        </label>
        {error ? <Alert variant="danger" title="Appointment not booked">{error}</Alert> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => goToStep(3)} disabled={busy}>← Back to date & time</Button>
          <Button variant="primary" className="flex-1" disabled={busy || !confirmationAcknowledged} onClick={confirmBooking}>
            {busy ? 'Booking…' : 'Confirm & Book'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Modal
      open={open}
      title="Book an Appointment"
      eyebrow="Patient scheduling"
      description="Follow the steps below to schedule your next visit."
      width="max-w-2xl"
      onClose={handleClose}
    >
      <div className="appointment-wizard" aria-label="Appointment booking wizard">
        <p className="sr-only" aria-live="polite">Step {step} of {STEP_LABELS.length}: {STEP_TITLES[step]}</p>
        <div className="appointment-wizard-steps" aria-label={`Step ${step} of ${STEP_LABELS.length}`}>
          {STEP_LABELS.map((label, index) => {
            const number = index + 1;
            const completed = number < step;
            const current = number === step;
            return (
              <button
                type="button"
                key={label}
                className={`appointment-wizard-step ${current ? 'is-current' : ''} ${completed ? 'is-complete' : ''}`}
                onClick={() => {
                  if (busy || number > step) return;
                  if (number <= 2 || (number === 3 && Boolean(visitCategory && serviceType))) goToStep(number);
                }}
                disabled={busy || number > step || (number === 3 && !(visitCategory && serviceType))}
                aria-current={current ? 'step' : undefined}
                aria-label={`${current ? 'Current step: ' : 'Go to '}${label}`}
              >
                <span className="appointment-wizard-step-number">{completed ? '✓' : number}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {renderStep()}
      </div>
    </Modal>
  );
}


function RescheduleAppointmentModal({ open, appointment, busy, onCancel, onSubmit }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState('');
  const [dateWindowStart, setDateWindowStart] = useState(0);
  const [availableSlots, setAvailableSlots] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const today = todayIso();

  const upcomingDates = useMemo(() => {
    const days = [];
    for (let i = 0; i < 21; i += 1) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      days.push({
        iso: d.toISOString().slice(0, 10),
        day: d.toLocaleDateString([], { day: '2-digit' }),
        month: d.toLocaleDateString([], { month: 'short' }).toUpperCase(),
        weekday: d.toLocaleDateString([], { weekday: 'short' }).toUpperCase(),
      });
    }
    return days;
  }, []);

  const visibleDates = upcomingDates.slice(dateWindowStart, dateWindowStart + 4);

  useEffect(() => {
    if (!appointment || !open) return;
    setDate(appointment.date || todayIso());
    setTime('');
    setError('');
    setDateWindowStart(0);
  }, [appointment, open]);

  useEffect(() => {
    if (!date || !open) {
      setAvailableSlots(null);
      return undefined;
    }
    let cancelled = false;
    setSlotsLoading(true);
    setSlotsError('');
    patientService.getAvailableSlots(date)
      .then((res) => {
        if (!cancelled) setAvailableSlots(Array.isArray(res?.data?.slots) ? res.data.slots : []);
      })
      .catch((err) => {
        if (!cancelled) setSlotsError(apiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => { cancelled = true; };
  }, [date, open]);

  function chooseDate(iso) {
    setDate(iso);
    setTime('');
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (!date || !time) {
      setError('Select both a new date and a new time.');
      return;
    }
    await onSubmit({ date, time });
  }

  if (!appointment) return null;

  return (
    <Modal
      open={open}
      title="Reschedule appointment"
      eyebrow="Appointment update"
      description="Choose a new date and time for this visit. Your current service and visit type will stay the same."
      width="max-w-xl"
      onClose={onCancel}
    >
      <form className="space-y-4" onSubmit={submit} noValidate>
        <div className="appointment-change-summary" role="note">
          <span className="appointment-choice-kicker">Current booking</span>
          <strong>{appointment.visitCategory === 'home_visit' ? 'Home Visit' : 'Hospital Visit'} · {appointment.serviceType}</strong>
          <span>{formatDate(appointment.date)} · {formatTime(appointment.time)}</span>
        </div>

        <div>
          <p className="field-label mb-2">New date</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setDateWindowStart((current) => Math.max(0, current - 1))} disabled={dateWindowStart === 0} aria-label="Earlier dates" className="appointment-date-nav">‹</button>
            <div className="flex-1 grid grid-cols-4 gap-2">
              {visibleDates.map((d) => (
                <button type="button" key={d.iso} onClick={() => chooseDate(d.iso)} className={`appointment-date-chip ${date === d.iso ? 'is-selected' : ''}`} aria-pressed={date === d.iso}>
                  <span className="block text-xs font-semibold">{d.month} {d.day}</span>
                  <span className="block text-xs text-[var(--color-text-soft)]">{d.weekday}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setDateWindowStart((current) => Math.min(upcomingDates.length - 4, current + 1))} disabled={dateWindowStart >= upcomingDates.length - 4} aria-label="Later dates" className="appointment-date-nav">›</button>
          </div>
        </div>

        <div>
          <p className="field-label mb-2">New time</p>
          {slotsLoading ? (
            <LoadingState label="Loading available times…" />
          ) : slotsError ? (
            <Alert variant="danger" title="Could not load times">{slotsError}</Alert>
          ) : !availableSlots || availableSlots.length === 0 ? (
            <EmptyState title="No time slots configured" subtitle="The hospital has not published any appointment times yet." />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {availableSlots.map((slot) => {
                const isCurrentSlot = appointment.date === date && appointment.time === slot.time;
                return (
                  <button
                    type="button"
                    key={slot.time}
                    disabled={!slot.available && !isCurrentSlot}
                    onClick={() => { setTime(slot.time); setError(''); }}
                    className={`appointment-slot-chip ${time === slot.time ? 'is-selected' : ''} ${!slot.available && !isCurrentSlot ? 'is-unavailable' : ''}`}
                    aria-pressed={time === slot.time}
                  >
                    {formatTime(slot.time)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-xs text-[var(--color-text-soft)]">The server remains the authority for appointment clashes. A conflicting slot will not overwrite the existing booking.</p>
        {error ? <div id="reschedule-error" role="alert" aria-live="assertive"><Alert variant="danger" title="Check the new slot">{error}</Alert></div> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Keep current time</Button>
          <Button type="submit" variant="primary" disabled={busy || !date || !time}>{busy ? 'Saving…' : 'Reschedule Appointment'}</Button>
        </div>
      </form>
    </Modal>
  );
}
