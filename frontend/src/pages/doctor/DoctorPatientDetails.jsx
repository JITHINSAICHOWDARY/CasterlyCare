import { doctorService } from '../../api/services/doctor';
import { API_BASE, apiErrorMessage, openSecureFile } from '../../api/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRealtime } from '../../context/RealtimeContext';
import { REALTIME_EVENTS } from '../../config/realtimeEvents';
import { DoctorDashboardShell as DashboardShell } from '../../components/RoleDashboardShell';
import {
  Panel,
  Button,
  Badge,
  RecoveryDonut,
  AlarmTimePicker,
  Modal,
  Alert,
  EmptyState,
  ConfirmModal,
  LoadingState,
} from '../../components/ui';

const DIET_TEMPLATES = ['Cardiac Diet', 'Low Sodium', 'Diabetic Diet', 'Soft Food (Post-Surgical)', 'Custom'];
const DIET_TEMPLATE_HINTS = {
  'Cardiac Diet': 'Limit high-sodium and heavily processed foods according to the care plan.',
  'Low Sodium': 'Use this template when sodium restriction is part of the current plan.',
  'Diabetic Diet': 'Use this template for carbohydrate-conscious guidance configured by the clinical team.',
  'Soft Food (Post-Surgical)': 'Use for texture-modified foods when clinically appropriate.',
  Custom: 'Add the specific ingredients or items to avoid for this recovery episode.',
};
const MED_FORMS = ['Tablet', 'Syrup', 'Injection', 'Ointment'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

function formatDate(value) {
  if (!value) return 'Not recorded';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

export default function DoctorPatientDetails() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { publish } = useRealtime();
  const fileInputRef = useRef();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(null);
  const [confirmDischarge, setConfirmDischarge] = useState(false);
  const [confirmRemoveMedicine, setConfirmRemoveMedicine] = useState(null);
  const [busyAction, setBusyAction] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [chatHistory, setChatHistory] = useState(null);
  const [chatHistoryError, setChatHistoryError] = useState('');
  const [expandedThreadId, setExpandedThreadId] = useState(null);

  const load = useCallback(async ({ background = false } = {}) => {
    try {
      background ? setRefreshing(true) : setError('');
      const res = await doctorService.getPatient(patientId);
      setData(res.data);
      setError('');
    } catch (err) {
      if (!background) setError(apiErrorMessage(err));
      else setActionMessage(`Refresh failed: ${apiErrorMessage(err)}`);
    } finally {
      setRefreshing(false);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    doctorService.getPatientChatHistory(patientId)
      .then((res) => { if (!cancelled) setChatHistory(res.data?.threads || []); })
      .catch((err) => { if (!cancelled) setChatHistoryError(apiErrorMessage(err)); });
    return () => { cancelled = true; };
  }, [patientId]);

  async function adjustRecovery(delta) {
    setBusyAction(`recovery:${delta}`);
    setActionMessage('');
    try {
      const response = await doctorService.updateRecoveryDays(patientId, delta);
      publish(REALTIME_EVENTS.RECOVERY_UPDATED, { patientId, delta, recovery: response?.data?.recovery || response?.data?.surgery || null });
      await load({ background: true });
      setActionMessage(delta > 0 ? 'Recovery duration extended by 1 day.' : 'Recovery duration reduced by 1 day.');
    } catch (err) {
      setActionMessage(apiErrorMessage(err));
    } finally {
      setBusyAction('');
    }
  }

  async function handleDischarge() {
    setBusyAction('discharge');
    try {
      await doctorService.dischargePatient(patientId);
      publish(REALTIME_EVENTS.CARE_EPISODE_COMPLETED, { patientId });
      setConfirmDischarge(false);
      navigate('/doctor/patients');
    } catch (err) {
      setActionMessage(apiErrorMessage(err));
    } finally {
      setBusyAction('');
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      setActionMessage('Only PDF, JPG, JPEG, and PNG files are allowed.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setActionMessage('The selected file is larger than 5 MB.');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('label', file.name);
    setBusyAction('file');
    setActionMessage('Uploading patient file…');
    try {
      await doctorService.uploadPatientFile(patientId, formData);
      await load({ background: true });
      setActionMessage('Patient file uploaded successfully.');
    } catch (err) {
      setActionMessage(apiErrorMessage(err));
    } finally {
      setBusyAction('');
    }
  }

  async function removeMedicine() {
    if (!confirmRemoveMedicine) return;
    setBusyAction(`medicine:${confirmRemoveMedicine.id}`);
    try {
      await doctorService.deleteMedicine(patientId, confirmRemoveMedicine.id);
      setConfirmRemoveMedicine(null);
      await load({ background: true });
      setActionMessage('Medicine removed from the active prescription list.');
    } catch (err) {
      setActionMessage(apiErrorMessage(err));
    } finally {
      setBusyAction('');
    }
  }

  if (error) {
    return (
      <DashboardShell>
        <Panel>
          <Alert variant="danger" title="Patient record unavailable">{error}</Alert>
          <div className="mt-4 flex gap-2 flex-wrap">
            <Button variant="primary" onClick={() => load()}>Retry</Button>
            <Button variant="outline" onClick={() => navigate('/doctor/patients')}>Back to patients</Button>
          </div>
        </Panel>
      </DashboardShell>
    );
  }

  if (!data) return <DashboardShell><LoadingState label="Loading patient record…" /></DashboardShell>;

  const patient = data.patient || {};
  const surgery = data.surgery || {};
  const recovery = data.recovery || {};
  const files = normalizeArray(data.files);
  const notes = normalizeArray(data.notes);
  const medicines = normalizeArray(data.medicines);
  const foodRestrictions = normalizeArray(data.foodRestrictions);
  const totalDays = Math.max(0, Number(recovery.totalDays) || 0);
  const remainingDays = Math.max(0, Math.min(Number(recovery.daysRemaining) || 0, totalDays));
  const completedDays = Math.max(0, totalDays - remainingDays);
  const recoveryComplete = totalDays > 0 && remainingDays === 0;

  return (
    <DashboardShell>
      <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={() => navigate('/doctor/patients')}
          className="text-sm text-[var(--color-text-soft)] hover:text-[var(--color-crimson)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)] rounded"
        >
          &larr; Back to patients
        </button>
        <Button variant="outline" onClick={() => load({ background: true })} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh record'}
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-gold-strong)]">Active patient record</p>
          <h1 className="font-display text-3xl text-[var(--color-ink)]">{patient.name || 'Patient'}</h1>
          <p className="text-[var(--color-text-soft)]">
            {surgery.surgeryName || 'Procedure not recorded'} &middot; Blood group {patient.bloodGroup || 'Not recorded'}
          </p>
        </div>
        <Button variant="danger" onClick={() => setConfirmDischarge(true)} disabled={busyAction === 'discharge'}>
          {busyAction === 'discharge' ? 'Discharging…' : 'Recovery Completed / Discharge'}
        </Button>
      </div>

      {actionMessage ? (
        <div className="mb-5" role="status" aria-live="polite">
          <Alert variant={actionMessage.toLowerCase().includes('failed') || actionMessage.toLowerCase().includes('error') || actionMessage.includes('Only ') || actionMessage.includes('larger') ? 'danger' : 'info'}>
            {actionMessage}
          </Alert>
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <Panel title="Recovery Tracker" className="xl:col-span-1">
          <div className="flex flex-col items-center">
            <RecoveryDonut totalDays={totalDays} daysRemaining={remainingDays} />
            <div className="grid grid-cols-3 gap-2 w-full mt-4 text-center">
              <div className="rounded-md bg-[var(--color-parchment-deep)] p-2">
                <p className="field-label">Total</p><p className="font-semibold">{totalDays || '—'}</p>
              </div>
              <div className="rounded-md bg-[var(--color-parchment-deep)] p-2">
                <p className="field-label">Completed</p><p className="font-semibold">{completedDays}</p>
              </div>
              <div className="rounded-md bg-[var(--color-parchment-deep)] p-2">
                <p className="field-label">Remaining</p><p className="font-semibold">{remainingDays}</p>
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-soft)] text-center mt-3">
              {recoveryComplete ? 'Configured recovery duration has reached zero remaining days.' : 'Adjust the configured recovery duration based on clinical review.'}
            </p>
            <div className="flex gap-2 mt-4 flex-wrap justify-center">
              <Button variant="outline" onClick={() => adjustRecovery(-1)} disabled={!remainingDays || busyAction === 'recovery:-1'}>
                {busyAction === 'recovery:-1' ? 'Updating…' : '− Reduce 1 day'}
              </Button>
              <Button variant="outline" onClick={() => adjustRecovery(1)} disabled={busyAction === 'recovery:1'}>
                {busyAction === 'recovery:1' ? 'Updating…' : '+ Extend 1 day'}
              </Button>
            </div>
          </div>
        </Panel>

        <Panel title="Current Care Episode" className="xl:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
            <div><p className="field-label">Procedure</p><p className="font-semibold">{surgery.surgeryName || 'Not recorded'}</p></div>
            <div><p className="field-label">Recovery start</p><p>{formatDate(surgery.startDate)}</p></div>
            <div><p className="field-label">Recovery plan</p><p>{totalDays ? `${totalDays} configured days` : 'Not recorded'}</p></div>
            <div><p className="field-label">Care status</p><Badge variant={recoveryComplete ? 'forest' : 'gold'}>{recoveryComplete ? 'Recovery duration reached' : 'Active recovery'}</Badge></div>
            <div><p className="field-label">Email</p><p className="break-words">{patient.email || 'Not recorded'}</p></div>
            <div><p className="field-label">Phone</p><p>{patient.phone || 'Not recorded'}</p></div>
            <div className="sm:col-span-2"><p className="field-label">Allergies</p><p>{patient.allergies || 'None recorded'}</p></div>
          </div>
          <p className="text-xs text-[var(--color-text-soft)] mt-5">
            This workspace shows the patient currently under your active recovery care. Historical surgical records are retained in the patient record; they do not create a permanent doctor assignment.
          </p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <Panel
          title="Files & Reports"
          action={<Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={busyAction === 'file'}>{busyAction === 'file' ? 'Uploading…' : '+ Upload PDF/JPG/PNG'}</Button>}
        >
          <input type="file" hidden ref={fileInputRef} accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} />
          <p className="text-xs text-[var(--color-text-soft)] mb-3">Clinical documents only. Maximum file size: 5 MB.</p>
          {files.length === 0 ? <EmptyState title="No files yet" subtitle="Uploaded clinical reports will appear here." /> : (
            <div className="space-y-2">
              {files.map((file) => {
                const isSecureFile = typeof file.fileUrl === 'string' && file.fileUrl.startsWith('/uploads/patient_files/');
                return isSecureFile ? (
                  <button
                    key={file.id}
                    type="button"
                    onClick={async () => {
                      try {
                        await openSecureFile(file.fileUrl);
                      } catch (err) {
                        setActionMessage(apiErrorMessage(err) || 'Unable to open file.');
                      }
                    }}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-md border border-[var(--color-line)] hover:border-[var(--color-crimson)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)] text-left"
                  >
                    <span className="min-w-0"><span className="block text-sm font-semibold truncate">{file.label || 'Untitled document'}</span><span className="block text-xs text-[var(--color-text-soft)]">Added {formatDateTime(file.createdAt)}</span></span>
                    <Badge variant="ink">{String(file.fileType || 'FILE').toUpperCase()}</Badge>
                  </button>
                ) : <div key={file.id} className="p-3 rounded-md border border-[var(--color-line)]"><p className="text-sm">Secure file link unavailable.</p></div>;
              })}
            </div>
          )}
        </Panel>

        <Panel title="Private Doctor's Notes" action={<Button variant="outline" onClick={() => setModal('note')}>+ Add Note</Button>}>
          <p className="text-xs text-[var(--color-text-soft)] mb-3">Private clinical observations visible only to authorized doctors.</p>
          {notes.length === 0 ? <EmptyState title="No notes yet" subtitle="Add clinical observations after a patient review or appointment." /> : (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {notes.map((note) => (
                <article key={note.id} className="p-3 rounded-md bg-[var(--color-parchment-deep)]">
                  <p className="text-sm whitespace-pre-wrap break-words">{note.content}</p>
                  <p className="text-xs text-[var(--color-text-soft)] mt-2">Recorded {formatDateTime(note.createdAt)}</p>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Active Medicines" action={<Button variant="outline" onClick={() => setModal('medicine')}>+ Add Medicine</Button>}>
          {medicines.length === 0 ? <EmptyState title="No medicines prescribed" subtitle="Active prescriptions entered for this recovery episode will appear here." /> : (
            <div className="space-y-2">
              {medicines.map((medicine) => (
                <div key={medicine.id} className="flex items-start justify-between gap-3 p-3 rounded-md border border-[var(--color-line)]">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold break-words">{medicine.name || 'Unnamed medicine'} <span className="text-[var(--color-text-soft)] font-normal">&middot; {medicine.dosage || 'Dosage not recorded'}</span></p>
                    <p className="text-xs text-[var(--color-text-soft)] mt-1">{medicine.form || 'Form not recorded'} &middot; {medicine.frequency || 'Frequency not recorded'}</p>
                    <div className="flex gap-1 flex-wrap mt-2">{normalizeArray(medicine.times).length ? normalizeArray(medicine.times).map((time, index) => <Badge key={`${medicine.id}-${index}`} variant="gold">{time}</Badge>) : <Badge variant="ink">Reminder time not recorded</Badge>}</div>
                  </div>
                  <Button variant="ghost" onClick={() => setConfirmRemoveMedicine(medicine)} disabled={busyAction === `medicine:${medicine.id}`}>{busyAction === `medicine:${medicine.id}` ? 'Removing…' : 'Remove'}</Button>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Food Restrictions" subtitle="Clinician-configured dietary rules for the current recovery episode." action={<Button variant="outline" onClick={() => setModal('diet')}>+ Add Restriction</Button>}>
          {foodRestrictions.length === 0 ? <EmptyState title="No restrictions set" subtitle="Add active dietary restrictions for this recovery episode." /> : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-[var(--color-text-soft)]">{foodRestrictions.length} active restriction record{foodRestrictions.length === 1 ? '' : 's'}</p>
                <Badge variant="forest">Current episode</Badge>
              </div>
              {foodRestrictions.map((restriction, index) => (
                <article key={restriction.id || `restriction-${index}`} className="p-4 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-muted)]">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      {restriction.dietTemplate ? <Badge variant="amber">{restriction.dietTemplate}</Badge> : <Badge variant="ink">Custom restriction</Badge>}
                      <p className="text-sm font-semibold mt-2 break-words">{restriction.ingredientsToAvoid || 'Restriction details not recorded'}</p>
                    </div>
                    <span className="text-xs text-[var(--color-text-soft)]">{formatDateTime(restriction.createdAt)}</span>
                  </div>
                  <p className="text-xs text-[var(--color-text-soft)] mt-2">Applies to the current recovery episode; historical restrictions are retained in the clinical record.</p>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Emergency Chat History"
        subtitle="Closed Priority Inbox conversations for this patient, retained for clinical and compliance reference."
      >
        {chatHistoryError ? (
          <Alert variant="danger" title="Chat history unavailable">{chatHistoryError}</Alert>
        ) : chatHistory === null ? (
          <p className="text-xs text-[var(--color-text-soft)]">Loading chat history…</p>
        ) : chatHistory.length === 0 ? (
          <EmptyState title="No past emergency chats" subtitle="Closed conversations with this patient will be archived here." />
        ) : (
          <div className="space-y-3">
            {chatHistory.map((thread) => {
              const isOpen = expandedThreadId === thread.id;
              return (
                <article key={thread.id} className="rounded-md border border-[var(--color-line)] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedThreadId(isOpen ? null : thread.id)}
                    className="w-full flex items-center justify-between gap-3 p-3 text-left bg-[var(--color-surface-muted)]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{thread.chatCode}</p>
                      <p className="text-xs text-[var(--color-text-soft)]">
                        Closed {formatDateTime(thread.closedAt)} &middot; {thread.messages.length} message{thread.messages.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <Badge variant="ink">{isOpen ? 'Hide' : 'View'}</Badge>
                  </button>
                  {isOpen ? (
                    <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
                      {thread.messages.map((message) => (
                        <div
                          key={message.id}
                          className={`p-2 rounded-md text-sm ${message.senderRole === 'doctor' ? 'bg-[var(--color-parchment-deep)]' : 'bg-[var(--color-surface-muted)]'}`}
                        >
                          <p className="text-xs font-semibold text-[var(--color-text-soft)] mb-1 capitalize">{message.senderRole}</p>
                          <p className="whitespace-pre-wrap break-words">{message.content}</p>
                          <p className="text-xs text-[var(--color-text-soft)] mt-1">{formatDateTime(message.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      <AddNoteModal open={modal === 'note'} onClose={() => setModal(null)} patientId={patientId} onSaved={load} />
      <AddMedicineModal open={modal === 'medicine'} onClose={() => setModal(null)} patientId={patientId} onSaved={load} />
      <AddDietModal open={modal === 'diet'} onClose={() => setModal(null)} patientId={patientId} onSaved={load} />

      <ConfirmModal
        open={confirmDischarge}
        title="Confirm discharge"
        body={`This will mark ${patient.name || 'this patient'}'s recovery as complete and remove the patient from your active care list. Historical records remain retained.`}
        confirmLabel={busyAction === 'discharge' ? 'Discharging…' : 'Confirm Discharge'}
        onConfirm={handleDischarge}
        onCancel={() => setConfirmDischarge(false)}
        confirmDisabled={busyAction === 'discharge'}
      />

      <ConfirmModal
        open={Boolean(confirmRemoveMedicine)}
        title="Remove active medicine"
        body={`Remove ${confirmRemoveMedicine?.name || 'this medicine'} from the active prescription list for this recovery episode?`}
        confirmLabel={busyAction.startsWith('medicine:') ? 'Removing…' : 'Remove Medicine'}
        onConfirm={removeMedicine}
        onCancel={() => setConfirmRemoveMedicine(null)}
        confirmDisabled={busyAction.startsWith('medicine:')}
      />
    </DashboardShell>
  );
}

function AddNoteModal({ open, onClose, patientId, onSaved }) {
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!open) { setContent(''); setError(''); } }, [open]);

  async function submit(e) {
    e.preventDefault();
    if (!content.trim()) { setError('Note content is required.'); return; }
    setSaving(true); setError('');
    try { await doctorService.addNote(patientId, content.trim()); setContent(''); await onSaved({ background: true }); onClose(); }
    catch (err) { setError(apiErrorMessage(err)); }
    finally { setSaving(false); }
  }

  return <Modal open={open} title="Add Private Note" description="This note is restricted to authorized clinical staff." onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <div><label className="field-label" htmlFor="doctor-private-note">Clinical observation</label><textarea id="doctor-private-note" required rows={6} maxLength={4000} className="field-textarea" placeholder="Record clinical observations…" value={content} onChange={(e) => setContent(e.target.value)} aria-describedby={error ? 'doctor-private-note-error' : undefined} /></div>
      {error ? <Alert variant="danger" id="doctor-private-note-error">{error}</Alert> : null}
      <Button type="submit" variant="primary" className="w-full" disabled={saving}>{saving ? 'Saving…' : 'Save Note'}</Button>
    </form>
  </Modal>;
}

function AddMedicineModal({ open, onClose, patientId, onSaved }) {
  const [form, setForm] = useState({ name: '', form: MED_FORMS[0], dosage: '', frequency: '', times: ['08:00 AM'] });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm({ name: '', form: MED_FORMS[0], dosage: '', frequency: '', times: ['08:00 AM'] });
      setError('');
      setSaving(false);
    }
  }, [open]);

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setTimeAt(index, value) {
    setForm((current) => {
      const times = [...current.times];
      times[index] = value;
      return { ...current, times };
    });
  }

  function addTime() {
    setForm((current) => ({ ...current, times: [...current.times, '12:00 PM'] }));
  }

  function removeTime(index) {
    setForm((current) => ({
      ...current,
      times: current.times.filter((_, timeIndex) => timeIndex !== index),
    }));
  }

  function normalizeTime(value) {
    /*
     * AlarmTimePicker produces values like "8:00 AM" - a
     * human-friendly 12-hour format - but the backend's medicine
     * route strictly validates times as 24-hour "HH:MM" (e.g.
     * "08:00") and rejects anything else. That mismatch meant
     * every single submission failed validation regardless of
     * what was actually picked. Convert here, at the API
     * boundary, so the picker's UI can stay 12-hour.
     */
    const trimmed = typeof value === 'string' ? value.trim().toUpperCase() : '';
    const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);

    if (!match) {
      return '';
    }

    let hour = Number(match[1]);
    const minute = match[2];
    const period = match[3];

    if (hour < 1 || hour > 12 || Number(minute) > 59) {
      return '';
    }

    if (period === 'AM' && hour === 12) hour = 0;
    if (period === 'PM' && hour !== 12) hour += 12;

    return `${String(hour).padStart(2, '0')}:${minute}`;
  }

  async function submit(e) {
    e.preventDefault();
    const name = form.name.trim();
    const dosage = form.dosage.trim();
    const frequency = form.frequency.trim();
    const times = form.times.map(normalizeTime).filter(Boolean);
    const uniqueTimes = [...new Set(times)];

    if (!name || !dosage || !frequency) {
      setError('Medicine name, dosage, and frequency are required.');
      return;
    }
    if (uniqueTimes.length !== times.length) {
      setError('Reminder times must be unique.');
      return;
    }
    if (uniqueTimes.length === 0) {
      setError('Add at least one alarm-style reminder time.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await doctorService.addMedicine(patientId, { ...form, name, dosage, frequency, times: uniqueTimes });
      await onSaved({ background: true });
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return <Modal open={open} title="Add Medicine" description="Add the active prescription for this recovery episode." onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="field-label" htmlFor="medicine-name">Medicine name</label><input id="medicine-name" required maxLength={160} autoComplete="off" className="field-input" value={form.name} onChange={(e) => setField('name', e.target.value)} /></div>
        <div><label className="field-label" htmlFor="medicine-form">Form</label><select id="medicine-form" className="field-select" value={form.form} onChange={(e) => setField('form', e.target.value)}>{MED_FORMS.map((option) => <option key={option}>{option}</option>)}</select></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="field-label" htmlFor="medicine-dosage">Dosage</label><input id="medicine-dosage" required maxLength={120} placeholder="e.g. 500mg" className="field-input" value={form.dosage} onChange={(e) => setField('dosage', e.target.value)} /></div>
        <div><label className="field-label" htmlFor="medicine-frequency">Frequency</label><input id="medicine-frequency" required maxLength={120} placeholder="e.g. Twice daily" className="field-input" value={form.frequency} onChange={(e) => setField('frequency', e.target.value)} /></div>
      </div>
      <fieldset className="space-y-3">
        <legend className="field-label">Reminder times</legend>
        <p className="text-xs text-[var(--color-text-soft)]">Select alarm-style times rather than typing them. Add one reminder for each scheduled dose.</p>
        <div className="space-y-2">
          {form.times.map((time, index) => (
            <div key={`medicine-time-${index}`} className="flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-[14rem]"><span className="sr-only">Reminder time {index + 1}</span><AlarmTimePicker value={time} onChange={(value) => setTimeAt(index, value)} /></div>
              <Button type="button" variant="ghost" onClick={() => removeTime(index)} disabled={form.times.length === 1 || saving} aria-label={`Remove reminder time ${index + 1}`}>Remove</Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" onClick={addTime} disabled={saving || form.times.length >= 8}>+ Add reminder time</Button>
        {form.times.length >= 8 ? <p className="text-xs text-[var(--color-text-soft)]">Maximum of 8 reminder times per prescription.</p> : null}
      </fieldset>
      {error ? <Alert variant="danger">{error}</Alert> : null}
      <Button type="submit" variant="primary" className="w-full" disabled={saving}>{saving ? 'Adding…' : 'Add Medicine'}</Button>
    </form>
  </Modal>;
}

function AddDietModal({ open, onClose, patientId, onSaved }) {
  const [dietTemplate, setDietTemplate] = useState(DIET_TEMPLATES[0]);
  const [ingredients, setIngredients] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!open) { setDietTemplate(DIET_TEMPLATES[0]); setIngredients(''); setError(''); setSaving(false); } }, [open]);

  async function submit(e) {
    e.preventDefault();
    const normalized = ingredients.split(',').map((item) => item.trim()).filter(Boolean);
    const unique = [...new Set(normalized.map((item) => item.toLowerCase()).map((lower) => normalized.find((item) => item.toLowerCase() === lower)))];
    if (unique.length === 0) { setError('Please list at least one ingredient or item to avoid.'); return; }
    if (unique.join(', ').length > 2000) { setError('Keep the restriction details within 2,000 characters.'); return; }
    setSaving(true); setError('');
    try {
      await doctorService.addFoodRestriction(patientId, { dietTemplate, ingredientsToAvoid: unique.join(', ') });
      await onSaved({ background: true });
      onClose();
    }
    catch (err) { setError(apiErrorMessage(err)); }
    finally { setSaving(false); }
  }

  const hint = DIET_TEMPLATE_HINTS[dietTemplate] || DIET_TEMPLATE_HINTS.Custom;

  return <Modal open={open} title="Add Food Restriction" description="These clinician-configured restrictions apply to the current recovery episode." onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <div><label className="field-label" htmlFor="diet-template">Diet template</label><select id="diet-template" className="field-select" value={dietTemplate} onChange={(e) => setDietTemplate(e.target.value)}>{DIET_TEMPLATES.map((option) => <option key={option}>{option}</option>)}</select><p className="text-xs text-[var(--color-text-soft)] mt-1">{hint}</p></div>
      <div>
        <label className="field-label" htmlFor="diet-restrictions">Ingredients / items to avoid</label>
        <textarea id="diet-restrictions" required rows={4} maxLength={2000} className="field-textarea" placeholder="e.g. salt, fried food, red meat" value={ingredients} onChange={(e) => setIngredients(e.target.value)} aria-describedby="diet-restrictions-help" />
        <p id="diet-restrictions-help" className="text-xs text-[var(--color-text-soft)] mt-1">Separate multiple items with commas. Duplicate items are collapsed before saving.</p>
      </div>
      {error ? <Alert variant="danger">{error}</Alert> : null}
      <Button type="submit" variant="primary" className="w-full" disabled={saving}>{saving ? 'Saving…' : 'Save Restriction'}</Button>
    </form>
  </Modal>;
}
