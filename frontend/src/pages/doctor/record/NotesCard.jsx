import { useState } from 'react';
import { doctorService } from '../../../api/services/doctor';
import { apiErrorMessage } from '../../../api/client';
import { Panel, Button, EmptyState, Alert } from '../../../components/ui';
import NavIcon from '../../../components/NavIcon';
import { friendlyTime } from '../../../utils/time';

const LIMIT = 4000;

// The doctor's private notes: write in place, newest first.
export default function NotesCard({ notes, readOnly, patientId, busyAction, onDelete, onSaved }) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || saving) return;
    setSaving(true);
    setError('');
    try {
      await doctorService.addNote(patientId, content);
      setDraft('');
      await onSaved({ background: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      title="Private notes"
      action={<span className="private-tag"><NavIcon name="lock" size={13} /> Only you can see these</span>}
    >
      {readOnly ? null : (
        <form onSubmit={save} className="note-composer">
          <label className="sr-only" htmlFor="note-draft">Write a private note</label>
          <textarea
            id="note-draft"
            rows={3}
            maxLength={LIMIT}
            className="note-input"
            placeholder="Write a private observation…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save(e); }}
          />
          <div className="note-composer-foot">
            <span className="field-count">{draft.length > LIMIT * 0.8 ? `${draft.length}/${LIMIT}` : 'Ctrl / ⌘ + Enter to save'}</span>
            <Button type="submit" variant="primary" size="sm" loading={saving} disabled={!draft.trim()}>Save note</Button>
          </div>
          {error ? <div role="alert"><Alert variant="danger">{error}</Alert></div> : null}
        </form>
      )}

      {notes.length === 0 ? (
        <EmptyState title="No notes yet" subtitle={readOnly ? 'No notes were recorded during this recovery.' : 'Your observations after reviews and visits will be listed here.'} />
      ) : (
        <ol className="note-list">
          {notes.map((note) => (
            <li key={note.id} className="note-item">
              <span className="note-dot" aria-hidden="true" />
              <div className="note-body">
                <div className="note-meta">
                  <time dateTime={note.createdAt} title={new Date(note.createdAt).toLocaleString()}>{friendlyTime(note.createdAt)}</time>
                  {readOnly ? null : (
                    <button type="button" className="icon-action" onClick={() => onDelete(note)} disabled={busyAction === `note:${note.id}`} aria-label="Delete note" title="Delete note">
                      <NavIcon name="trash" size={16} />
                    </button>
                  )}
                </div>
                <p className="note-text">{note.content}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
