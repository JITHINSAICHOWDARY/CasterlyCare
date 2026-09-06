import { useEffect, useMemo, useRef, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { patientService } from '../../api/services/patient';
import PatientDashboardShell from '../../components/PatientDashboardShell';
import { Alert, Badge, Button, EmptyState, Panel, SectionHeading } from '../../components/ui';


const INITIAL_FORM = {
  spo2: '',
  systolic: '',
  diastolic: '',
  heartRate: '',
  temperature: '',
};

const VITAL_FIELDS = [
  { key: 'spo2', label: 'SpO₂', unit: '%', min: 70, max: 100, step: '0.1', help: 'Peripheral oxygen saturation; enter the value shown by your device.' },
  { key: 'heartRate', label: 'Heart rate', unit: 'bpm', min: 30, max: 220, step: '1', help: 'Beats per minute; use the measured reading rather than an estimate.' },
  { key: 'systolic', label: 'Blood pressure — systolic', unit: 'mmHg', min: 60, max: 250, step: '1', help: 'Upper blood pressure value.' },
  { key: 'diastolic', label: 'Blood pressure — diastolic', unit: 'mmHg', min: 30, max: 150, step: '1', help: 'Lower blood pressure value.' },
  { key: 'temperature', label: 'Body temperature', unit: '°F', min: 86, max: 110, step: '0.1', help: 'Use Fahrenheit for this assessment.' },
];

const MONITORING_COPY = {
  normal: {
    variant: 'forest',
    label: 'Within configured monitoring parameters',
    detail: 'No significant deviation detected in this measurement set.',
  },
  anomaly: {
    variant: 'danger',
    label: 'Significant deviation detected',
    detail: 'This measurement set is outside the configured monitoring parameters. Clinical review is recommended.',
  },
};

const TREND_COPY = {
  Improving: { variant: 'forest', label: 'Longitudinal signal: moving toward configured monitoring range' },
  Stable: { variant: 'gold', label: 'Longitudinal signal: no significant directional change' },
  'Requires Attention': { variant: 'danger', label: 'Longitudinal signal: deviation warrants clinical review' },
  'Insufficient Data': { variant: 'muted', label: 'Longitudinal signal: insufficient data' },
};

function displayNumber(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Not recorded';
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(digits);
}

function formatRecordedAt(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date not recorded' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function validateVitals(form) {
  const errors = {};
  for (const field of VITAL_FIELDS) {
    const raw = form[field.key];
    const value = Number(raw);
    if (raw === '' || !Number.isFinite(value)) {
      errors[field.key] = `Enter a measured ${field.label.toLowerCase()}.`;
      continue;
    }
    if (value < field.min || value > field.max) {
      errors[field.key] = `${field.label} must be between ${field.min} and ${field.max} ${field.unit}.`;
    }
  }
  if (Number.isFinite(Number(form.systolic)) && Number.isFinite(Number(form.diastolic)) && Number(form.systolic) <= Number(form.diastolic)) {
    errors.systolic = 'Systolic pressure must be higher than diastolic pressure.';
    errors.diastolic = 'Diastolic pressure must be lower than systolic pressure.';
  }
  return errors;
}

export default function PatientAssessment() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const errorRef = useRef(null);
  const resultRef = useRef(null);

  async function loadHistory({ preserve = true } = {}) {
    if (preserve && history.length) setRefreshing(true);
    else setLoadingHistory(true);
    setLoadError('');
    try {
      const res = await patientService.getAssessmentHistory();
      const nextHistory = Array.isArray(res.data?.history) ? res.data.history : [];
      setHistory(nextHistory);
      if (!result && nextHistory.length) setResult(nextHistory[nextHistory.length - 1]);
    } catch (err) {
      if (!history.length) setLoadError(err.response?.data?.error || 'Assessment history could not be loaded.');
      else setLoadError(err.response?.data?.error || 'The latest assessment history could not be refreshed.');
    } finally {
      setLoadingHistory(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadHistory({ preserve: false });
  }, []);

  useEffect(() => {
    if (error && errorRef.current) errorRef.current.focus();
  }, [error]);

  useEffect(() => {
    if (result && resultRef.current) resultRef.current.focus();
  }, [result]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    const errors = validateVitals(form);
    setFieldErrors(errors);
    setError('');
    if (Object.keys(errors).length) {
      const firstInvalid = Object.keys(errors)[0];
      document.getElementById(`assessment-${firstInvalid}`)?.focus();
      return;
    }

    setBusy(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, Number(value)]));
      const res = await patientService.submitAssessment(payload);
      const nextResult = res.data?.result;
      if (!nextResult) throw new Error('Assessment result was not returned.');
      setResult(nextResult);
      setHistory((current) => [...current, nextResult]);
      setForm(INITIAL_FORM);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'The assessment could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  const chartData = useMemo(() => history.map((entry, index) => ({
    index: index + 1,
    score: Number(entry.anomalyScore),
    recordedAt: formatRecordedAt(entry.createdAt),
  })).filter((entry) => Number.isFinite(entry.score)), [history]);

  const trajectorySummary = useMemo(() => {
    if (!chartData.length) return null;
    const latest = chartData[chartData.length - 1];
    const previous = chartData.length > 1 ? chartData[chartData.length - 2] : null;
    const delta = previous ? latest.score - previous.score : null;
    return {
      count: chartData.length,
      latest: latest.score,
      delta,
      firstRecordedAt: chartData[0].recordedAt,
      latestRecordedAt: latest.recordedAt,
    };
  }, [chartData]);

  const latestTrend = result?.trendLabel && TREND_COPY[result.trendLabel]
    ? TREND_COPY[result.trendLabel]
    : TREND_COPY['Insufficient Data'];
  const monitoring = result?.anomalyLabel === 'normal' ? MONITORING_COPY.normal : MONITORING_COPY.anomaly;

  return (
    <PatientDashboardShell>
      <div className="assessment-page">
        <div className="mb-6">
          <SectionHeading
            eyebrow="Recovery monitoring"
            title="Assessment & Vitals"
            description="Record your current measurements to support longitudinal recovery monitoring. Automated results are monitoring support, not a diagnosis."
          />
        </div>

        {loadError && (
          <div className="mb-6">
            <Alert variant={history.length ? 'warning' : 'danger'}>
              {loadError} {history.length ? 'Your previously loaded assessments remain available.' : 'Retry the history load to continue.'}
              <div className="mt-3">
                <Button type="button" variant="secondary" size="sm" onClick={() => loadHistory({ preserve: true })} disabled={refreshing || loadingHistory}>
                  {refreshing ? 'Refreshing…' : 'Refresh history'}
                </Button>
              </div>
            </Alert>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-6 mb-6">
          <Panel title="Record current vitals" subtitle="Enter the values exactly as measured. Do not estimate a reading.">
            <form onSubmit={submit} noValidate className="space-y-5" aria-describedby="assessment-disclaimer">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {VITAL_FIELDS.map((field) => (
                  <div key={field.key} className={field.key === 'temperature' ? 'sm:col-span-2' : ''}>
                    <label className="field-label" htmlFor={`assessment-${field.key}`}>
                      {field.label} <span className="text-[var(--color-text-muted)]">({field.unit})</span>
                    </label>
                    <input
                      id={`assessment-${field.key}`}
                      autoComplete="off"
                      name={field.key}
                      type="number"
                      inputMode="decimal"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      className={`field-input ${fieldErrors[field.key] ? 'field-input-error' : ''}`}
                      value={form[field.key]}
                      onChange={(event) => updateField(field.key, event.target.value)}
                      onWheel={(event) => event.currentTarget.blur()}
                      aria-invalid={Boolean(fieldErrors[field.key])}
                      aria-describedby={fieldErrors[field.key] ? `assessment-${field.key}-error` : `assessment-${field.key}-help`}
                    />
                    <div id={`assessment-${field.key}-help`} className="field-help">{field.help}</div>
                    {fieldErrors[field.key] && <div id={`assessment-${field.key}-error`} className="field-error" role="alert">{fieldErrors[field.key]}</div>}
                  </div>
                ))}
              </div>

              {error && (
                <div ref={errorRef} tabIndex={-1}>
                  <Alert variant="danger" role="alert">{error}</Alert>
                </div>
              )}

              <div className="assessment-form-actions">
                <Button type="button" variant="ghost" className="w-full" onClick={() => { setForm(INITIAL_FORM); setFieldErrors({}); setError(''); }} disabled={busy}>
                  Clear measurements
                </Button>
                <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                  {busy ? 'Processing…' : 'Run assessment'}
                </Button>
              </div>

              <div className="assessment-entry-note" role="note">
                Enter a fresh measured reading for each field. Values are checked for valid input ranges before submission.
              </div>

              <p id="assessment-disclaimer" className="medical-disclaimer">
                Automated assessment supports monitoring only. It does not diagnose illness, replace clinical judgment, or determine whether urgent medical care is required.
              </p>
            </form>
          </Panel>

          <Panel title="Latest monitoring result" subtitle={result ? formatRecordedAt(result.createdAt) : 'No new assessment recorded in this session.'}>
            {loadingHistory && !result ? (
              <div className="py-10 text-center text-[var(--color-text-soft)]" aria-live="polite">Loading assessment history…</div>
            ) : !result ? (
              <EmptyState title="No assessment recorded yet" subtitle="Enter your measured vitals to create your first monitoring result." />
            ) : (
              <div ref={resultRef} tabIndex={-1} className="space-y-5 outline-none" aria-live="polite">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={monitoring.variant}>{monitoring.label}</Badge>
                  <Badge variant={latestTrend.variant}>{latestTrend.label}</Badge>
                </div>

                <div className="assessment-result-summary" role="status" aria-live="polite">
                  <div>
                    <span>Monitoring score</span>
                    <strong>{displayNumber(result.anomalyScore, 3)}</strong>
                  </div>
                  <p>
                    {result.anomalyLabel === 'normal'
                      ? 'No significant deviation was detected in the submitted measurements.'
                      : 'The submitted measurements differ from the configured monitoring reference. Clinical review is recommended.'}
                  </p>
                </div>

                <div className="assessment-vitals-grid">
                  <div><span>SpO₂</span><strong>{displayNumber(result.spo2)}%</strong></div>
                  <div><span>Heart rate</span><strong>{displayNumber(result.heartRate)} bpm</strong></div>
                  <div><span>Blood pressure</span><strong>{displayNumber(result.systolic, 0)} / {displayNumber(result.diastolic, 0)} mmHg</strong></div>
                  <div><span>Temperature</span><strong>{displayNumber(result.temperature)} °F</strong></div>
                </div>

                <div className="assessment-result-copy">
                  <strong>{monitoring.detail}</strong>
                  {result.anomalyLabel !== 'normal' && (
                    <p className="mt-2">Consider discussing this reading with your clinician. Use Emergency Chat for urgent concerns or symptoms.</p>
                  )}
                </div>
              </div>
            )}
          </Panel>
        </div>

        <Panel title="Longitudinal monitoring" subtitle="Historical monitoring scores are shown as a measurement trajectory. Directional changes do not by themselves indicate clinical improvement or deterioration.">
          {chartData.length < 2 ? (
            <EmptyState title="Not enough longitudinal data yet" subtitle="Continue recording measurements over multiple days to build a monitoring trajectory." />
          ) : (
            <div>
              {trajectorySummary && (
                <div className="assessment-trajectory-summary" role="status" aria-live="polite">
                  <div><span>Recorded assessments</span><strong>{trajectorySummary.count}</strong></div>
                  <div><span>Latest monitoring score</span><strong>{trajectorySummary.latest.toFixed(3)}</strong></div>
                  <div>
                    <span>Change from previous score</span>
                    <strong>{trajectorySummary.delta === null ? 'Not available' : `${trajectorySummary.delta >= 0 ? '+' : ''}${trajectorySummary.delta.toFixed(3)}`}</strong>
                  </div>
                </div>
              )}
              <div className="assessment-chart" role="img" aria-label="Historical monitoring score trajectory. Refer to the accessible table below for the recorded values.">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
                    <XAxis dataKey="index" tick={{ fontSize: 12 }} label={{ value: 'Assessment sequence', position: 'insideBottom', offset: -4 }} />
                    <YAxis domain={[0, 1]} tick={{ fontSize: 12 }} width={40} label={{ value: 'Score', angle: -90, position: 'insideLeft' }} />
                    <Tooltip formatter={(value) => [Number(value).toFixed(3), 'Monitoring score']} labelFormatter={(value, payload) => payload?.[0]?.payload?.recordedAt || `Assessment ${value}`} />
                    <Line type="monotone" dataKey="score" stroke="var(--color-crimson)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} name="Monitoring score" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="assessment-trajectory-table-wrap" role="region" aria-label="Accessible historical assessment records">
                <table className="assessment-trajectory-table">
                  <caption className="sr-only">Historical monitoring scores by assessment sequence and recording time</caption>
                  <thead><tr><th scope="col">Assessment</th><th scope="col">Recorded</th><th scope="col">Monitoring score</th></tr></thead>
                  <tbody>
                    {chartData.slice(-8).map((entry) => (
                      <tr key={`${entry.index}-${entry.recordedAt}`}>
                        <td>{entry.index}</td>
                        <td>{entry.recordedAt}</td>
                        <td>{entry.score.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {refreshing && <div className="mt-3 text-sm text-[var(--color-text-soft)]" aria-live="polite">Refreshing historical assessments…</div>}
        </Panel>

        <div className="mt-6">
          <Alert variant="info">
            Automated monitoring is not a substitute for professional medical care. Seek appropriate clinical or emergency assistance for concerning symptoms, regardless of the displayed assessment result.
          </Alert>
        </div>
      </div>
    </PatientDashboardShell>
  );
}
