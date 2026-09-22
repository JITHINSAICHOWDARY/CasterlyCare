import { useEffect, useState } from 'react';
import { doctorService } from '../../../api/services/doctor';
import { apiErrorMessage } from '../../../api/client';
import { Panel, Button, EmptyState, Alert, Modal } from '../../../components/ui';
import NavIcon from '../../../components/NavIcon';
import TagInput from '../../../components/TagInput';
import { friendlyTime } from '../../../utils/time';

const TEMPLATES = {
  'Cardiac Diet': { hint: 'Limit high-sodium and heavily processed foods.', suggestions: ['salt', 'pickles', 'fried food', 'red meat', 'butter', 'processed meat'] },
  'Low Sodium': { hint: 'For when sodium restriction is part of the plan.', suggestions: ['salt', 'pickles', 'papad', 'processed food', 'instant noodles', 'soy sauce'] },
  'Diabetic Diet': { hint: 'Carbohydrate-conscious guidance.', suggestions: ['sugar', 'sweets', 'white rice', 'fruit juice', 'maida', 'soft drinks'] },
  'Soft Food (Post-Surgical)': { hint: 'Texture-modified foods after surgery.', suggestions: ['nuts', 'raw vegetables', 'hard bread', 'popcorn', 'tough meat'] },
  Custom: { hint: 'List the specific items to avoid.', suggestions: [] },
};

const split = (text) => String(text || '').split(',').map((item) => item.trim()).filter(Boolean);

export default function RestrictionsCard({ restrictions, readOnly, patientId, busyAction, onRemove, onSaved }) {
  const [open, setOpen] = useState(false);

  return (
    <>
    <Panel
      title="Food restrictions"
      action={readOnly ? null : <Button variant="outline" size="sm" onClick={() => setOpen(true)}><NavIcon name="plus" size={15} /> Add restriction</Button>}
    >
      {restrictions.length === 0 ? (
        <EmptyState title="No restrictions set" subtitle={readOnly ? 'No dietary restrictions were set during this recovery.' : 'Add foods the patient should avoid.'} />
      ) : (
        <ul className="diet-list">
          {restrictions.map((item) => (
            <li key={item.id} className="diet-card">
              <div className="diet-head">
                <span className="diet-name"><NavIcon name="diet" size={17} />{item.dietTemplate || 'Custom restriction'}</span>
                <span className="diet-when">{friendlyTime(item.createdAt)}</span>
                {readOnly ? null : (
                  <button type="button" className="icon-action" onClick={() => onRemove(item)} disabled={busyAction === `restriction:${item.id}`} aria-label="Remove restriction" title="Remove restriction">
                    <NavIcon name="trash" size={16} />
                  </button>
                )}
              </div>
              <div className="tag-row">
                {split(item.ingredientsToAvoid).map((tag) => <span key={tag} className="tag is-avoid">{tag}</span>)}
              </div>
            </li>
          ))}
        </ul>
      )}

    </Panel>
    <AddRestrictionModal open={open} onClose={() => setOpen(false)} patientId={patientId} onSaved={onSaved} />
    </>
  );
}

function AddRestrictionModal({ open, onClose, patientId, onSaved }) {
  const [template, setTemplate] = useState('Cardiac Diet');
  const [tags, setTags] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!open) { setTemplate('Cardiac Diet'); setTags([]); setError(''); setSaving(false); } }, [open]);

  async function submit(e) {
    e.preventDefault();
    if (tags.length === 0) { setError('Add at least one food to avoid.'); return; }
    const ingredients = tags.join(', ');
    if (ingredients.length > 2000) { setError('That list is too long. Keep it under 2,000 characters.'); return; }
    setSaving(true);
    setError('');
    try {
      await doctorService.addFoodRestriction(patientId, { dietTemplate: template, ingredientsToAvoid: ingredients });
      await onSaved({ background: true });
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title="Add food restriction" description="These apply to the patient's current recovery." onClose={onClose}>
      <form onSubmit={submit} className="rx-form">
        <div>
          <p className="field-label">Diet type</p>
          <div className="seg" role="radiogroup" aria-label="Diet type">
            {Object.keys(TEMPLATES).map((name) => (
              <button key={name} type="button" role="radio" aria-checked={template === name} className={`seg-btn ${template === name ? 'is-on' : ''}`} onClick={() => setTemplate(name)}>{name}</button>
            ))}
          </div>
          <p className="field-count" style={{ textAlign: 'left' }}>{TEMPLATES[template].hint}</p>
        </div>

        <div>
          <label className="field-label" htmlFor="diet-tags">Foods to avoid</label>
          <TagInput id="diet-tags" tags={tags} onChange={setTags} suggestions={TEMPLATES[template].suggestions} placeholder="Type a food and press Enter" />
        </div>

        {error ? <div role="alert"><Alert variant="danger">{error}</Alert></div> : null}
        <div className="rx-actions">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving}>Save restriction</Button>
        </div>
      </form>
    </Modal>
  );
}
