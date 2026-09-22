import { useCallback, useEffect, useMemo, useState } from 'react';
import { doctorService } from '../../../api/services/doctor';
import { apiErrorMessage } from '../../../api/client';
import { Button, Alert, Modal } from '../../../components/ui';
import DatePicker from '../../../components/DatePicker';
import SlotPicker from '../../../components/SlotPicker';
import { slotLabel } from '../../../utils/time';

const VISITS = {
  home_visit: { label: 'Home visit', services: { dressing: 'Dressing', physiotherapy: 'Physiotherapy', vitals_check: 'Vitals check' } },
  hospital_visit: { label: 'Hospital visit', services: { doctor_visit: 'Doctor visit', pharmacy_visit: 'Pharmacy visit' } },
};

function prettyDate(value) {
  const d = value ? new Date(`${value}T00:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) : '';
}

// Follow-ups can only go into times the administrator published for this doctor.
export default function FollowUpModal({ open, onClose, patientId, onSaved }) {
  const [visit, setVisit] = useState('home_visit');
  const [service, setService] = useState('dressing');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setVisit('home_visit'); setService('dressing'); setDate(''); setTime(''); setNotes(''); setError(''); setSaving(false); }
  }, [open]);

  const fetchDays = useCallback((month) => doctorService.getSlotDays(month).then((res) => res.data?.days || []), []);
  const services = useMemo(() => Object.entries(VISITS[visit].services), [visit]);

  function pickVisit(next) {
    setVisit(next);
    setService(Object.keys(VISITS[next].services)[0]);
  }

  async function submit(e) {
    e.preventDefault();
    if (!date || !time) { setError('Choose a day and one of your open times.'); return; }
    setSaving(true);
    setError('');
    try {
      await doctorService.createAppointment(patientId, { visitCategory: visit, serviceType: service, date, time, notes: notes.trim() || undefined });
      onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title="Schedule follow-up" description="Book the next visit in one of your open times." onClose={onClose}>
      <form onSubmit={submit} className="rx-form">
        <div>
          <p className="field-label">Where</p>
          <div className="seg seg-wide" role="radiogroup" aria-label="Visit type">
            {Object.entries(VISITS).map(([key, item]) => (
              <button key={key} type="button" role="radio" aria-checked={visit === key} className={`seg-btn ${visit === key ? 'is-on' : ''}`} onClick={() => pickVisit(key)}>{item.label}</button>
            ))}
          </div>
        </div>

        <div>
          <p className="field-label">What</p>
          <div className="seg" role="radiogroup" aria-label="Service">
            {services.map(([key, label]) => (
              <button key={key} type="button" role="radio" aria-checked={service === key} className={`seg-btn ${service === key ? 'is-on' : ''}`} onClick={() => setService(key)}>{label}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="followup-date">Day</label>
          <DatePicker id="followup-date" value={date} onChange={(next) => { setDate(next); setTime(''); }} fetchEnabledDays={fetchDays} />
        </div>

        <div>
          <p className="field-label">Time</p>
          <SlotPicker date={date} value={time} onChange={setTime} />
        </div>

        <div>
          <label className="field-label" htmlFor="followup-notes">Note for the patient <span className="field-optional">(optional)</span></label>
          <textarea id="followup-notes" rows={2} maxLength={255} className="field-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {date && time ? (
          <p className="rx-summary" role="status">
            <strong>{prettyDate(date)}</strong> at <strong>{slotLabel(time)}</strong> · {VISITS[visit].label}, {VISITS[visit].services[service]}
          </p>
        ) : null}

        {error ? <div role="alert"><Alert variant="danger">{error}</Alert></div> : null}
        <div className="rx-actions">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving} disabled={!date || !time}>Schedule follow-up</Button>
        </div>
      </form>
    </Modal>
  );
}
