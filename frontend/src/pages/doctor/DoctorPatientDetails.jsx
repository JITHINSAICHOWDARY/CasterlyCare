import { doctorService } from '../../api/services/doctor';
import { apiErrorMessage, openSecureFile } from '../../api/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useRealtime } from '../../context/RealtimeContext';
import { REALTIME_EVENTS, APPOINTMENT_REALTIME_EVENTS, RECOVERY_REALTIME_EVENTS } from '../../config/realtimeEvents';
import NavIcon from '../../components/NavIcon';
import { friendlyTime } from '../../utils/time';
import VitalsChart from '../../components/VitalsChart';
import NotesCard from './record/NotesCard';
import MedicinesCard from './record/MedicinesCard';
import RestrictionsCard from './record/RestrictionsCard';
import FollowUpModal from './record/FollowUpModal';
import GlassLensFilter from '../../components/GlassLensFilter';
import { DoctorDashboardShell as DashboardShell } from '../../components/RoleDashboardShell';
import {
  Panel,
  Button,
  Badge,
  RecoveryDonut,
  Alert,
  EmptyState,
  ConfirmModal,
  LoadingState,
  PageHeader,
} from '../../components/ui';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

function formatDate(value) {
  if (!value) return 'Not recorded';
  const date = new Date(String(value).length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

const formatDateTime = friendlyTime;

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

export default function DoctorPatientDetails() {
  const { patientId } = useParams();
  const [searchParams] = useSearchParams();
  const episodeId = searchParams.get('episode') || undefined;
  const navigate = useNavigate();
  const { subscribe } = useRealtime();
  const fileInputRef = useRef();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [confirmRemoveMedicine, setConfirmRemoveMedicine] = useState(null);
  const [confirmRemoveRestriction, setConfirmRemoveRestriction] = useState(null);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [confirmDeleteNote, setConfirmDeleteNote] = useState(null);
  const [confirmDeleteFile, setConfirmDeleteFile] = useState(null);
  const [busyAction, setBusyAction] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [chatHistory, setChatHistory] = useState(null);
  const [chatHistoryError, setChatHistoryError] = useState('');
  const [expandedThreadId, setExpandedThreadId] = useState(null);

  const load = useCallback(async ({ background = false } = {}) => {
    try {
      if (!background) setError('');
      const res = await doctorService.getPatient(patientId, episodeId);
      setData(res.data);
      setError('');
    } catch (err) {
      if (!background) setError(apiErrorMessage(err));
      else setActionMessage(`Refresh failed: ${apiErrorMessage(err)}`);
    }
  }, [patientId, episodeId]);

  useEffect(() => { load(); }, [load]);

  // The recovery's days ran out while this page was open: it is now Completed.
  useEffect(() => {
    if (episodeId) return undefined;
    return subscribe(REALTIME_EVENTS.CARE_EPISODE_COMPLETED, (event) => {
      if (!event?.patientId || event.patientId === patientId) navigate('/doctor/patients?tab=completed');
    });
  }, [subscribe, patientId, episodeId, navigate]);

  // Keeps the record current without a manual refresh.
  useEffect(() => {
    const events = [...APPOINTMENT_REALTIME_EVENTS, ...RECOVERY_REALTIME_EVENTS];
    const cleanups = events.map((eventName) => subscribe(eventName, () => load({ background: true })));
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [subscribe, load]);

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
      if (response?.data?.completed) {
        navigate('/doctor/patients?tab=completed');
        return;
      }
      await load({ background: true });
      setActionMessage(delta > 0 ? 'Recovery duration extended by 1 day.' : 'Recovery duration reduced by 1 day.');
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

  async function deleteNote() {
    if (!confirmDeleteNote) return;
    setBusyAction(`note:${confirmDeleteNote.id}`);
    try {
      await doctorService.deleteNote(patientId, confirmDeleteNote.id);
      setConfirmDeleteNote(null);
      await load({ background: true });
      setActionMessage('Note deleted.');
    } catch (err) {
      setActionMessage(apiErrorMessage(err));
    } finally {
      setBusyAction('');
    }
  }

  async function deleteFile() {
    if (!confirmDeleteFile) return;
    setBusyAction(`filedel:${confirmDeleteFile.id}`);
    try {
      await doctorService.deleteFile(patientId, confirmDeleteFile.id);
      setConfirmDeleteFile(null);
      await load({ background: true });
      setActionMessage('File deleted.');
    } catch (err) {
      setActionMessage(apiErrorMessage(err));
    } finally {
      setBusyAction('');
    }
  }

  async function removeRestriction() {
    if (!confirmRemoveRestriction) return;
    setBusyAction(`restriction:${confirmRemoveRestriction.id}`);
    try {
      await doctorService.deleteFoodRestriction(patientId, confirmRemoveRestriction.id);
      setConfirmRemoveRestriction(null);
      await load({ background: true });
      setActionMessage('Food restriction removed.');
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
  const vitals = normalizeArray(data.vitals);
  const totalDays = Math.max(0, Number(recovery.totalDays) || 0);
  const remainingDays = Math.max(0, Math.min(Number(recovery.daysRemaining) || 0, totalDays));
  const completedDays = Math.max(0, totalDays - remainingDays);
  const recoveryComplete = totalDays > 0 && remainingDays === 0;
  const readOnly = Boolean(data.readOnly);
  const backTo = readOnly ? '/doctor/patients?tab=completed' : '/doctor/patients';

  return (
    <DashboardShell>
      <div className="doctor-record-page">
      <GlassLensFilter />
      <button type="button" onClick={() => navigate(backTo)} className="back-link">
        <NavIcon name="chevronLeft" size={16} />
        Back to patients
      </button>

      <PageHeader
        eyebrow={readOnly ? 'Completed recovery record' : 'Active patient record'}
        title={patient.name || 'Patient'}
        subtitle={surgery.surgeryName || 'Procedure not recorded'}
      >
        <div className="record-chips">
          <span className="record-chip"><span>Blood group</span><strong>{patient.bloodGroup || 'Not recorded'}</strong></span>
          <span className="record-chip"><span>Phone</span><strong>{patient.phone || 'Not recorded'}</strong></span>
          {readOnly
            ? <span className="record-chip"><span>Completed</span><strong>{formatDate(recovery.dischargeDate || recovery.completedAt)}</strong></span>
            : <span className="record-chip"><span>Days left</span><strong>{remainingDays}</strong></span>}
          {data.needsReview ? <span className="record-chip is-alert"><strong>Needs review</strong></span> : null}
        </div>
      </PageHeader>

      {readOnly ? (
        <div className="mb-5" role="status">
          <Alert variant="ink" title="This recovery is complete">This is a read-only record. Notes, medicines, files and diet can no longer be changed.</Alert>
        </div>
      ) : null}

      {actionMessage ? (
        <div className="mb-5" role="status" aria-live="polite">
          <Alert variant={actionMessage.toLowerCase().includes('failed') || actionMessage.toLowerCase().includes('error') || actionMessage.includes('Only ') || actionMessage.includes('larger') ? 'danger' : 'info'}>
            {actionMessage}
          </Alert>
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <Panel title="Recovery Tracker">
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
            {readOnly ? null : (
            <div className="flex gap-2 mt-4 flex-wrap justify-center">
                <Button variant="outline" onClick={() => adjustRecovery(-1)} disabled={!remainingDays || busyAction === 'recovery:-1'}>
                  {busyAction === 'recovery:-1' ? 'Updating…' : 'Reduce by 1 day'}
                </Button>
                <Button variant="outline" onClick={() => adjustRecovery(1)} disabled={busyAction === 'recovery:1'}>
                  {busyAction === 'recovery:1' ? 'Updating…' : 'Extend by 1 day'}
                </Button>
              </div>
            )}
          </div>
        </Panel>

        <Panel title={readOnly ? 'Care episode' : 'Current Care Episode'} action={readOnly ? null : <Button variant="outline" onClick={() => setFollowUpOpen(true)}>Schedule follow-up</Button>}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
            <div><p className="field-label">Procedure</p><p className="font-semibold">{surgery.surgeryName || 'Not recorded'}</p></div>
            <div><p className="field-label">Recovery start</p><p>{formatDate(surgery.startDate)}</p></div>
            <div><p className="field-label">Recovery plan</p><p>{totalDays ? `${totalDays} configured days` : 'Not recorded'}</p></div>
            <div><p className="field-label">Care status</p><Badge variant={readOnly ? 'ink' : recoveryComplete ? 'forest' : 'gold'}>{readOnly ? 'Completed' : recoveryComplete ? 'Recovery duration reached' : 'Active recovery'}</Badge></div>
            <div><p className="field-label">Email</p><p className="break-words">{patient.email || 'Not recorded'}</p></div>
            <div><p className="field-label">Phone</p><p>{patient.phone || 'Not recorded'}</p></div>
            <div className="sm:col-span-2"><p className="field-label">Allergies</p><p>{patient.allergies || 'None recorded'}</p></div>
          </div>
        </Panel>
      </div>

      <Panel
        title="Recovery check-ins"
        className="mb-6"
        action={data.needsReview ? <Badge variant="danger">Needs review</Badge> : null}
      >
        {vitals.length === 0 ? (
          <EmptyState title="No check-ins yet" subtitle="Recorded vitals will appear here as the patient submits them." />
        ) : (
          <>
          <VitalsChart vitals={vitals} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm vitals-table">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-text-soft)] border-b border-[var(--color-line)]">
                  <th className="pb-2 pr-3">Recorded</th>
                  <th className="pb-2 pr-3">SpO₂</th>
                  <th className="pb-2 pr-3">Blood pressure</th>
                  <th className="pb-2 pr-3">Heart rate</th>
                  <th className="pb-2 pr-3">Temp</th>
                  <th className="pb-2">Assessment</th>
                </tr>
              </thead>
              <tbody>
                {vitals.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--color-line)] last:border-0">
                    <td data-label="Recorded" className="py-2.5 pr-3 whitespace-nowrap">{formatDateTime(item.measuredAt)}</td>
                    <td data-label="SpO₂" className="py-2.5 pr-3">{item.spo2}%</td>
                    <td data-label="Blood pressure" className="py-2.5 pr-3">{item.systolic}/{item.diastolic}</td>
                    <td data-label="Heart rate" className="py-2.5 pr-3">{item.heartRate} bpm</td>
                    <td data-label="Temp" className="py-2.5 pr-3">{item.temperature}°C</td>
                    <td data-label="Assessment" className="py-2.5">
                      <Badge variant={item.anomalyLabel === 'outlier' ? 'danger' : 'forest'}>{item.anomalyLabel === 'outlier' ? 'Outside range' : 'Within range'}</Badge>
                      <span className="ml-2 text-xs text-[var(--color-text-soft)]">{item.trendLabel}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <Panel
          title="Files & Reports"
          action={readOnly ? null : <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={busyAction === 'file'}>{busyAction === 'file' ? 'Uploading…' : 'Upload file'}</Button>}
        >
          <input type="file" hidden ref={fileInputRef} accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} />
          {readOnly ? null : <p className="text-xs text-[var(--color-text-soft)] mb-3">Clinical documents only. Maximum file size: 5 MB.</p>}
          {files.length === 0 ? <EmptyState title="No files yet" subtitle={readOnly ? 'No files were uploaded during this recovery.' : 'Uploaded clinical reports will appear here.'} /> : (
            <div className="space-y-2">
              {files.map((file) => {
                const isSecureFile = typeof file.fileUrl === 'string' && file.fileUrl.startsWith('/uploads/patient_files/');
                return isSecureFile ? (
                  <div key={file.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await openSecureFile(file.fileUrl);
                        } catch (err) {
                          setActionMessage(apiErrorMessage(err) || 'Unable to open file.');
                        }
                      }}
                      className="min-w-0 flex-1 flex items-center justify-between gap-3 p-3 rounded-md border border-[var(--color-line)] hover:border-[var(--color-crimson)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)] text-left"
                    >
                      <span className="min-w-0"><span className="block text-sm font-semibold truncate">{file.label || 'Untitled document'}</span><span className="block text-xs text-[var(--color-text-soft)]">Added {formatDateTime(file.createdAt)}</span></span>
                      <Badge variant="ink">{String(file.fileType || 'FILE').toUpperCase()}</Badge>
                    </button>
                    {readOnly ? null : <Button variant="ghost" onClick={() => setConfirmDeleteFile(file)} disabled={busyAction === `filedel:${file.id}`}>Delete</Button>}
                  </div>
                ) : <div key={file.id} className="p-3 rounded-md border border-[var(--color-line)]"><p className="text-sm">Secure file link unavailable.</p></div>;
              })}
            </div>
          )}
        </Panel>

        <NotesCard notes={notes} readOnly={readOnly} patientId={patientId} busyAction={busyAction} onDelete={setConfirmDeleteNote} onSaved={load} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <MedicinesCard medicines={medicines} readOnly={readOnly} patientId={patientId} busyAction={busyAction} onRemove={setConfirmRemoveMedicine} onSaved={load} />

        <RestrictionsCard restrictions={foodRestrictions} readOnly={readOnly} patientId={patientId} busyAction={busyAction} onRemove={setConfirmRemoveRestriction} onSaved={load} />
      </div>

      <Panel
        title="Emergency Chat History"
      >
        {chatHistoryError ? (
          <Alert variant="danger" title="Chat history unavailable">{chatHistoryError}</Alert>
        ) : chatHistory === null ? (
          <LoadingState label="Loading chat history…" rows={2} />
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

      <FollowUpModal open={followUpOpen} onClose={() => setFollowUpOpen(false)} patientId={patientId} onSaved={() => setActionMessage('Follow-up scheduled.')} />

      <ConfirmModal
        open={Boolean(confirmDeleteNote)}
        title="Delete note"
        body="Delete this private note? This cannot be undone."
        confirmLabel={busyAction.startsWith('note:') ? 'Deleting…' : 'Delete note'}
        onConfirm={deleteNote}
        onCancel={() => setConfirmDeleteNote(null)}
        confirmDisabled={busyAction.startsWith('note:')}
      />

      <ConfirmModal
        open={Boolean(confirmDeleteFile)}
        title="Delete file"
        body={`Delete "${confirmDeleteFile?.label || 'this file'}"? It will also disappear from the patient's own reports, and cannot be recovered.`}
        confirmLabel={busyAction.startsWith('filedel:') ? 'Deleting…' : 'Delete file'}
        onConfirm={deleteFile}
        onCancel={() => setConfirmDeleteFile(null)}
        confirmDisabled={busyAction.startsWith('filedel:')}
      />

      <ConfirmModal
        open={Boolean(confirmRemoveRestriction)}
        title="Remove food restriction"
        body={`Remove "${confirmRemoveRestriction?.ingredientsToAvoid || 'this restriction'}" from this recovery episode? The patient's diet checks will stop enforcing it.`}
        confirmLabel={busyAction.startsWith('restriction:') ? 'Removing…' : 'Remove restriction'}
        onConfirm={removeRestriction}
        onCancel={() => setConfirmRemoveRestriction(null)}
        confirmDisabled={busyAction.startsWith('restriction:')}
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
      </div>
    </DashboardShell>
  );
}
