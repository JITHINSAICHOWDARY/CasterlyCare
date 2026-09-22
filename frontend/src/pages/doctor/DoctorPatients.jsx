import { doctorService } from '../../api/services/doctor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DoctorDashboardShell as DashboardShell } from '../../components/RoleDashboardShell';
import { Panel, Button, Badge, EmptyState, RecoveryDonut, Alert, LoadingState, PageHeader } from '../../components/ui';
import NavIcon from '../../components/NavIcon';
import GlassLensFilter from '../../components/GlassLensFilter';
import { useRealtime } from '../../context/RealtimeContext';
import { RECOVERY_REALTIME_EVENTS } from '../../config/realtimeEvents';

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Not recorded';
}

export default function DoctorPatients() {
  const [patients, setPatients] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'completed' ? 'completed' : 'ongoing';
  const loadedOnce = useRef(false);
  const navigate = useNavigate();
  const { subscribe } = useRealtime();

  // Stable on purpose: it must not depend on `patients`, or every load would
  // change it and re-trigger the effect below in an endless request loop.
  const load = useCallback(async ({ background = false } = {}) => {
    if (!background) setRefreshing(true);
    try {
      const res = await doctorService.getPatients();
      setPatients(Array.isArray(res.data?.patients) ? res.data.patients : []);
      loadedOnce.current = true;
      setError('');
    } catch (err) {
      setError(err?.message || (loadedOnce.current
        ? 'The patient list could not be refreshed. Showing the latest available data.'
        : 'Unable to load your patient list.'));
    } finally {
      if (!background) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const cleanups = RECOVERY_REALTIME_EVENTS.map((eventName) =>
      subscribe(eventName, () => load({ background: true })),
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [subscribe, load]);

  const { ongoing, completed } = useMemo(() => {
    const list = patients || [];
    return {
      // Those needing review come first, then the fewest days left.
      ongoing: list
        .filter((item) => item.status === 'active')
        .sort((a, b) => Number(b.needsReview) - Number(a.needsReview) || (a.recoveryDaysRemaining ?? 0) - (b.recoveryDaysRemaining ?? 0)),
      completed: list
        .filter((item) => item.status === 'completed')
        .sort((a, b) => new Date(b.completedAt || b.dischargeDate || 0) - new Date(a.completedAt || a.dischargeDate || 0)),
    };
  }, [patients]);

  const shown = tab === 'completed' ? completed : ongoing;

  function selectTab(next) {
    setSearchParams(next === 'completed' ? { tab: 'completed' } : {}, { replace: true });
  }

  function openRecord(item) {
    navigate(item.status === 'completed'
      ? `/doctor/patients/${item.patientId}?episode=${item.careEpisodeId}`
      : `/doctor/patients/${item.patientId}`);
  }

  return (
    <DashboardShell>
      <div className="doctor-patients-page">
        <GlassLensFilter />
        <PageHeader
          title="Your Patients"
          subtitle={patients ? `${ongoing.length} ongoing · ${completed.length} completed` : 'Patients under your care'}
        />

        <div className="admin-chips mb-5" role="tablist" aria-label="Patient status">
          {[['ongoing', 'Ongoing', ongoing.length], ['completed', 'Completed', completed.length]].map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`admin-chip ${tab === key ? 'is-active' : ''}`}
              onClick={() => selectTab(key)}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        {error && patients ? <div className="mb-5" role="status" aria-live="polite"><Alert variant="warning" title="Patient list refresh failed">{error}</Alert></div> : null}
        {!patients && error ? (
          <Panel>
            <Alert variant="danger" title="Unable to load patients">{error}</Alert>
            <div className="mt-4"><Button variant="primary" onClick={() => load()} disabled={refreshing}>{refreshing ? 'Retrying…' : 'Retry'}</Button></div>
          </Panel>
        ) : !patients ? (
          <LoadingState label="Loading patients…" />
        ) : shown.length === 0 ? (
          <Panel>
            {tab === 'completed'
              ? <EmptyState title="No completed recoveries yet" subtitle="When a patient's recovery days run out, they move here automatically, separate from your ongoing patients." />
              : <EmptyState title="No ongoing patients" subtitle="Share your unique doctor ID with a patient to link them to your care." />}
          </Panel>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" role="tabpanel">
            {shown.map((p) => (
              <Panel key={p.careEpisodeId || p.patientId} className="patient-card flex flex-col items-center text-center min-w-0">
                {p.needsReview ? <Badge variant="danger" className="patient-card-flag">Needs review</Badge> : null}

                {p.status === 'completed' ? (
                  <span className="patient-done-mark" aria-hidden="true"><NavIcon name="check" size={44} /></span>
                ) : (
                  <RecoveryDonut totalDays={p.recoveryTotalDays} daysRemaining={p.recoveryDaysRemaining} size={110} />
                )}

                <p className="font-display text-lg text-[var(--color-ink)] mt-2 break-words">{p.name || 'Patient'}</p>
                <p className="text-sm text-[var(--color-text-soft)] mb-4 break-words">{p.surgeryName || 'Procedure not recorded'}</p>
                <p className="text-xs text-[var(--color-text-soft)] mb-4">
                  {p.status === 'completed'
                    ? `Completed ${formatDate(p.dischargeDate || p.completedAt)}`
                    : Number.isFinite(Number(p.recoveryDaysRemaining)) ? `${p.recoveryDaysRemaining} days remaining` : 'Recovery days not recorded'}
                </p>

                <Button variant={p.status === 'completed' ? 'outline' : 'primary'} className="w-full mt-auto" onClick={() => openRecord(p)}>
                  {p.status === 'completed' ? 'View record' : 'View details'}
                </Button>
              </Panel>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
