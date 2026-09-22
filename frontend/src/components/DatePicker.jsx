import { useEffect, useMemo, useRef, useState } from 'react';
import NavIcon from './NavIcon';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

function todayISO() {
  const now = new Date();
  return isoOf(now.getFullYear(), now.getMonth(), now.getDate());
}

function parse(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return match ? { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) } : null;
}

function longLabel(value) {
  const p = parse(value);
  return p
    ? new Date(p.y, p.m, p.d).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : '';
}

/*
 * A calendar that opens in place (not as a floating popover, so a scrolling
 * dialog never clips it). Days before `min` are disabled. When
 * `fetchEnabledDays(monthKey)` is given it must return the days of that month
 * that can be chosen; every other day is disabled and the enabled ones get a
 * dot. Keep that function stable (useCallback) - it re-runs when it changes.
 */
export default function DatePicker({ id, value, onChange, min, max, fetchEnabledDays, placeholder = 'Choose a date' }) {
  const minDate = min || todayISO();
  const anchor = parse(value) || parse(minDate);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ y: anchor.y, m: anchor.m });
  const [enabled, setEnabled] = useState(null);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef(null);
  const minParts = parse(minDate);
  const maxParts = max ? parse(max) : null;

  useEffect(() => {
    if (!open || !fetchEnabledDays) return undefined;
    let cancelled = false;
    setLoading(true);
    setEnabled(null);
    fetchEnabledDays(`${view.y}-${pad(view.m + 1)}`)
      .then((days) => { if (!cancelled) setEnabled(new Set(days)); })
      .catch(() => { if (!cancelled) setEnabled(new Set()); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, view.y, view.m, fetchEnabledDays]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => { if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const cells = useMemo(() => {
    const offset = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
    const count = new Date(view.y, view.m + 1, 0).getDate();
    return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  }, [view.y, view.m]);

  const atEarliestMonth = view.y < minParts.y || (view.y === minParts.y && view.m <= minParts.m);
  const atLatestMonth = maxParts && (view.y > maxParts.y || (view.y === maxParts.y && view.m >= maxParts.m));
  const monthTitle = new Date(view.y, view.m, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
  const today = todayISO();

  function shift(delta) {
    setView((current) => {
      const next = new Date(current.y, current.m + delta, 1);
      return { y: next.getFullYear(), m: next.getMonth() };
    });
  }

  function choose(iso) {
    onChange(iso);
    setOpen(false);
  }

  return (
    <div className="dp" ref={rootRef}>
      <button
        type="button"
        id={id}
        className={`dp-trigger ${open ? 'is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { if (!open) { const a = parse(value) || parse(minDate); setView({ y: a.y, m: a.m }); } setOpen((v) => !v); }}
      >
        <NavIcon name="calendar" size={18} />
        <span className={value ? '' : 'dp-placeholder'}>{value ? longLabel(value) : placeholder}</span>
      </button>

      {open ? (
        <div className="dp-panel" role="dialog" aria-label="Choose a date">
          <div className="dp-head">
            <button type="button" className="dp-nav" onClick={() => shift(-1)} disabled={atEarliestMonth} aria-label="Previous month"><NavIcon name="chevronLeft" size={16} /></button>
            <strong className="dp-title" aria-live="polite">{monthTitle}</strong>
            <button type="button" className="dp-nav" onClick={() => shift(1)} disabled={atLatestMonth} aria-label="Next month"><NavIcon name="chevronRight" size={16} /></button>
          </div>

          <div className="dp-grid dp-weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>

          <div className={`dp-grid ${loading ? 'is-loading' : ''}`} role="grid">
            {cells.map((day, index) => {
              if (day === null) return <span key={`gap-${index}`} />;
              const iso = isoOf(view.y, view.m, day);
              const blocked = iso < minDate || (max && iso > max) || (fetchEnabledDays ? !enabled || !enabled.has(iso) : false);
              const selected = iso === value;
              return (
                <button
                  key={iso}
                  type="button"
                  role="gridcell"
                  className={`dp-day ${selected ? 'is-selected' : ''} ${iso === today ? 'is-today' : ''} ${fetchEnabledDays && enabled?.has(iso) ? 'has-open' : ''}`}
                  disabled={blocked}
                  aria-selected={selected}
                  aria-label={longLabel(iso)}
                  onClick={() => choose(iso)}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {fetchEnabledDays ? (
            <p className="dp-note" role="status">
              {loading ? 'Checking your open days…' : enabled && enabled.size === 0 ? 'No open days this month. Ask the administrator to publish times.' : <><span className="dp-dot" /> Days with open times</>}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
