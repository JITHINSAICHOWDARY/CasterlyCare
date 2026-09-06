import { doctorService } from '../../api/services/doctor';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DoctorDashboardShell as DashboardShell } from '../../components/RoleDashboardShell';
import { Panel, Button, EmptyState, RecoveryDonut, Alert, LoadingState } from '../../components/ui';
import { useRealtime } from '../../context/RealtimeContext';
import { RECOVERY_REALTIME_EVENTS } from '../../config/realtimeEvents';

export default function DoctorPatients() {
  const [patients, setPatients] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();
  const { subscribe } = useRealtime();

  const load = useCallback(async ({ background = false } = {}) => {
    if (!background) setRefreshing(true);
    try {
      const res = await doctorService.getPatients();
      setPatients(Array.isArray(res.data?.patients) ? res.data.patients : []);
      setError('');
    } catch (err) {
      if (!patients) setError(err?.message || 'Unable to load your patient list.');
      else setError(err?.message || 'The patient list could not be refreshed. Showing the latest available data.');
    } finally {
      if (!background) setRefreshing(false);
    }
  }, [patients]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const cleanups = RECOVERY_REALTIME_EVENTS.map((eventName) =>
      subscribe(eventName, () => load({ background: true })),
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [subscribe, load]);

  return (
    <DashboardShell>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl text-[var(--color-ink)] mb-1">Your Patients</h1>
          <p className="text-[var(--color-text-soft)] mt-1">Patients currently under your care for an active recovery.</p>
        </div>
        <Button variant="outline" onClick={() => load()} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh patients'}
        </Button>
      </div>

      {error && patients ? <div className="mb-5" role="status" aria-live="polite"><Alert variant="warning" title="Patient list refresh failed">{error}</Alert></div> : null}
      {!patients && error ? (
        <Panel>
          <Alert variant="danger" title="Unable to load patients">{error}</Alert>
          <div className="mt-4"><Button variant="primary" onClick={() => load()} disabled={refreshing}>{refreshing ? 'Retrying…' : 'Retry'}</Button></div>
        </Panel>
      ) : !patients ? (
        <LoadingState label="Loading active patients…" />
      ) : patients.length === 0 ? (
        <Panel><EmptyState title="No patients assigned yet" subtitle="Share your unique doctor ID with a patient to link them to your care." /></Panel>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {patients.map((p) => (
            <Panel key={p.patientId} className="flex flex-col items-center text-center min-w-0">
              <RecoveryDonut totalDays={p.recoveryTotalDays} daysRemaining={p.recoveryDaysRemaining} size={110} />
              <p className="font-display text-lg text-[var(--color-ink)] mt-2 break-words">{p.name || 'Patient'}</p>
              <p className="text-sm text-[var(--color-text-soft)] mb-4 break-words">{p.surgeryName || 'Procedure not recorded'}</p>
              <p className="text-xs text-[var(--color-text-soft)] mb-4">{Number.isFinite(Number(p.recoveryDaysRemaining)) ? `${p.recoveryDaysRemaining} days remaining` : 'Recovery days not recorded'}</p>
              <Button variant="primary" className="w-full" onClick={() => navigate(`/doctor/patients/${p.patientId}`)}>
                View Details
              </Button>
            </Panel>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
