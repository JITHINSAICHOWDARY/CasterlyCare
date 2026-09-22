import { useEffect, useState } from 'react';
import { doctorService } from '../api/services/doctor';
import { apiErrorMessage } from '../api/client';
import { Skeleton } from './ui';
import { slotLabel } from '../utils/time';

// A doctor can only book or move an appointment into a time the administrator
// has published for them, so this shows exactly those times for the chosen day.
export default function SlotPicker({ date, value, onChange, excludeAppointmentId }) {
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!date) return undefined;
    let cancelled = false;
    setSlots(null);
    setError('');
    doctorService
      .getSlots(date, excludeAppointmentId)
      .then((res) => { if (!cancelled) setSlots(Array.isArray(res.data?.slots) ? res.data.slots : []); })
      .catch((err) => { if (!cancelled) setError(apiErrorMessage(err)); });
    return () => { cancelled = true; };
  }, [date, excludeAppointmentId]);

  if (!date) return <p className="text-sm text-[var(--color-text-soft)]">Choose a date to see your open times.</p>;
  if (error) return <p className="text-sm text-[var(--color-danger)]" role="alert">{error}</p>;
  if (!slots) return <Skeleton className="skeleton-line" style={{ width: '60%' }} />;
  if (slots.length === 0) {
    return <p className="text-sm text-[var(--color-text-soft)]">No times are published for you on this day. Ask the administrator to add some.</p>;
  }

  return (
    <div className="admin-chips" role="group" aria-label="Open times">
      {slots.map((slot) => (
        <button
          key={slot.time}
          type="button"
          disabled={!slot.available}
          aria-pressed={value === slot.time}
          className={`admin-chip ${value === slot.time ? 'is-active' : ''}`}
          onClick={() => onChange(slot.time)}
        >
          {slotLabel(slot.time)}
        </button>
      ))}
    </div>
  );
}
