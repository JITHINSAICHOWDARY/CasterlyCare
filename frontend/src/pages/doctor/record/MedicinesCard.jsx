import { useEffect, useState } from 'react';
import { doctorService } from '../../../api/services/doctor';
import { apiErrorMessage } from '../../../api/client';
import { Panel, Button, EmptyState, Alert, Modal } from '../../../components/ui';
import NavIcon from '../../../components/NavIcon';
import ReminderTimes from '../../../components/ReminderTimes';
import { to24Hour, to12Hour } from '../../../utils/time';

const FORMS = ['Tablet', 'Syrup', 'Injection', 'Ointment'];
const FREQUENCIES = [
  { label: 'Once daily', times: ['8:00 AM'] },
  { label: 'Twice daily', times: ['8:00 AM', '8:00 PM'] },
  { label: '3 times daily', times: ['8:00 AM', '2:00 PM', '9:00 PM'] },
  { label: '4 times daily', times: ['6:00 AM', '12:00 PM', '6:00 PM', '10:00 PM'] },
  { label: 'Custom', times: null },
];
const BLANK = { name: '', dosage: '', form: FORMS[0], frequency: 'Twice daily', custom: '', times: FREQUENCIES[1].times };

export default function MedicinesCard({ medicines, readOnly, patientId, busyAction, onRemove, onSaved }) {
  const [open, setOpen] = useState(false);

  return (
    <>
    <Panel
      title={readOnly ? 'Medicines' : 'Active medicines'}
      action={readOnly ? null : <Button variant="outline" size="sm" onClick={() => setOpen(true)}><NavIcon name="plus" size={15} /> Add medicine</Button>}
    >
      {medicines.length === 0 ? (
        <EmptyState title="No medicines prescribed" subtitle={readOnly ? 'No medicines were prescribed during this recovery.' : 'Prescriptions for this recovery will be listed here.'} />
      ) : (
        <ul className="med-list">
          {medicines.map((medicine) => {
            const times = Array.isArray(medicine.times) ? medicine.times : [];
            return (
              <li key={medicine.id} className="med-card">
                <span className="med-icon" aria-hidden="true"><NavIcon name="medicines" size={22} /></span>
                <div className="med-main">
                  <p className="med-name">{medicine.name || 'Unnamed medicine'}<span>{medicine.dosage}</span></p>
                  <p className="med-meta">{[medicine.form, medicine.frequency].filter(Boolean).join(' · ') || 'Details not recorded'}</p>
                  <div className="reminder-chips">
                    {times.length
                      ? times.map((time) => <span key={time} className="time-chip"><NavIcon name="clock" size={14} />{to12Hour(time)}</span>)
                      : <span className="reminder-empty">No reminder times</span>}
                  </div>
                </div>
                {readOnly ? null : (
                  <button type="button" className="icon-action" onClick={() => onRemove(medicine)} disabled={busyAction === `medicine:${medicine.id}`} aria-label={`Remove ${medicine.name}`} title="Remove medicine">
                    <NavIcon name="trash" size={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

    </Panel>
    <AddMedicineModal open={open} onClose={() => setOpen(false)} patientId={patientId} onSaved={onSaved} />
    </>
  );
}

function AddMedicineModal({ open, onClose, patientId, onSaved }) {
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!open) { setForm(BLANK); setError(''); setSaving(false); } }, [open]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  function pickFrequency(item) {
    setForm((current) => ({ ...current, frequency: item.label, times: item.times ? [...item.times] : current.times }));
  }

  async function submit(e) {
    e.preventDefault();
    const name = form.name.trim();
    const dosage = form.dosage.trim();
    const frequency = form.frequency === 'Custom' ? form.custom.trim() : form.frequency;
    const times = [...new Set(form.times.map(to24Hour).filter(Boolean))];

    if (!name || !dosage || !frequency) { setError('Add the medicine name, dosage and how often it is taken.'); return; }
    if (times.length === 0) { setError('Add at least one reminder time.'); return; }

    setSaving(true);
    setError('');
    try {
      await doctorService.addMedicine(patientId, { name, dosage, frequency, form: form.form, times });
      await onSaved({ background: true });
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title="Add medicine" description="Prescribe a medicine and set when the patient is reminded." onClose={onClose}>
      <form onSubmit={submit} className="rx-form">
        <div className="rx-grid">
          <div>
            <label className="field-label" htmlFor="rx-name">Medicine name</label>
            <input id="rx-name" className="field-input" maxLength={160} autoComplete="off" placeholder="e.g. Paracetamol" value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
          </div>
          <div>
            <label className="field-label" htmlFor="rx-dosage">Dosage</label>
            <input id="rx-dosage" className="field-input" maxLength={120} autoComplete="off" placeholder="e.g. 500 mg" value={form.dosage} onChange={(e) => set('dosage', e.target.value)} />
          </div>
        </div>

        <div>
          <p className="field-label">Form</p>
          <div className="seg" role="radiogroup" aria-label="Medicine form">
            {FORMS.map((option) => (
              <button key={option} type="button" role="radio" aria-checked={form.form === option} className={`seg-btn ${form.form === option ? 'is-on' : ''}`} onClick={() => set('form', option)}>{option}</button>
            ))}
          </div>
        </div>

        <div>
          <p className="field-label">How often</p>
          <div className="seg" role="radiogroup" aria-label="Frequency">
            {FREQUENCIES.map((item) => (
              <button key={item.label} type="button" role="radio" aria-checked={form.frequency === item.label} className={`seg-btn ${form.frequency === item.label ? 'is-on' : ''}`} onClick={() => pickFrequency(item)}>{item.label}</button>
            ))}
          </div>
          {form.frequency === 'Custom' ? (
            <input className="field-input mt-3" maxLength={120} placeholder="e.g. Every 6 hours after meals" aria-label="Custom frequency" value={form.custom} onChange={(e) => set('custom', e.target.value)} />
          ) : null}
        </div>

        <div>
          <p className="field-label">Reminder times</p>
          <ReminderTimes times={form.times} onChange={(times) => set('times', times)} disabled={saving} />
        </div>

        {error ? <div role="alert"><Alert variant="danger">{error}</Alert></div> : null}
        <div className="rx-actions">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving}>Add medicine</Button>
        </div>
      </form>
    </Modal>
  );
}
