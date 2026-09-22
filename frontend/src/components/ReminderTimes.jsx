import { useState } from 'react';
import NavIcon from './NavIcon';
import { Button } from './ui';

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

// "8:30 PM" -> minutes since midnight, for ordering.
function minutesOf(value) {
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(value);
  if (!match) return 0;
  return ((Number(match[1]) % 12) + (match[3] === 'PM' ? 12 : 0)) * 60 + Number(match[2]);
}

// Reminder times as removable chips, with a small hour / minute / AM-PM picker
// that opens in place. `times` are 12-hour strings like "8:00 AM".
export default function ReminderTimes({ times, onChange, max = 8, disabled = false }) {
  const [adding, setAdding] = useState(false);
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState('00');
  const [period, setPeriod] = useState('AM');

  const sorted = [...times].sort((a, b) => minutesOf(a) - minutesOf(b));
  const candidate = `${hour}:${minute} ${period}`;
  const duplicate = times.includes(candidate);

  function add() {
    if (duplicate || times.length >= max) return;
    onChange([...times, candidate]);
    setAdding(false);
  }

  return (
    <div className="reminder">
      <div className="reminder-chips">
        {sorted.length === 0 ? <span className="reminder-empty">No reminder times yet</span> : null}
        {sorted.map((time) => (
          <span key={time} className="time-chip is-removable">
            <NavIcon name="clock" size={14} />
            {time}
            <button type="button" className="time-chip-x" onClick={() => onChange(times.filter((item) => item !== time))} disabled={disabled} aria-label={`Remove ${time}`}>
              <NavIcon name="x" size={12} />
            </button>
          </span>
        ))}
        {!adding && times.length < max ? (
          <button type="button" className="time-chip is-add" onClick={() => setAdding(true)} disabled={disabled}>
            <NavIcon name="plus" size={14} /> Add time
          </button>
        ) : null}
      </div>

      {adding ? (
        <div className="tp-panel" role="group" aria-label="Pick a reminder time">
          <div className="tp-cols">
            <div className="tp-col" role="listbox" aria-label="Hour">
              {HOURS.map((n) => (
                <button key={n} type="button" role="option" aria-selected={hour === n} className={`tp-cell ${hour === n ? 'is-on' : ''}`} onClick={() => setHour(n)}>{n}</button>
              ))}
            </div>
            <div className="tp-col" role="listbox" aria-label="Minute">
              {MINUTES.map((n) => (
                <button key={n} type="button" role="option" aria-selected={minute === n} className={`tp-cell ${minute === n ? 'is-on' : ''}`} onClick={() => setMinute(n)}>{n}</button>
              ))}
            </div>
            <div className="tp-col tp-period" role="listbox" aria-label="AM or PM">
              {['AM', 'PM'].map((n) => (
                <button key={n} type="button" role="option" aria-selected={period === n} className={`tp-cell ${period === n ? 'is-on' : ''}`} onClick={() => setPeriod(n)}>{n}</button>
              ))}
            </div>
          </div>
          <div className="tp-foot">
            <strong className="tp-preview">{candidate}</strong>
            <span className="tp-actions">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
              <Button type="button" variant="primary" size="sm" onClick={add} disabled={duplicate}>{duplicate ? 'Already added' : 'Add time'}</Button>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
