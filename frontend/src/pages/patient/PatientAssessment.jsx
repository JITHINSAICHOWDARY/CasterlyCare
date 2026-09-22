import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { patientService } from '../../api/services/patient';
import { PatientDashboardShell } from '../../components/RoleDashboardShell';
import { Alert, Badge, Button, EmptyState, PageHeader, Panel } from '../../components/ui';
import NavIcon from '../../components/NavIcon';
import GlassLensFilter from '../../components/GlassLensFilter';

const INITIAL_FORM = {
  spo2: '',
  systolic: '',
  diastolic: '',
  heartRate: '',
  temperature: '',
};

// min/max are the hard limits a value must fall within to submit at all.
// normal/caution give the live in-range indicator something to judge
// against — general adult reference points, not a personalized target.
const VITAL_FIELDS = [
  { key: 'spo2', label: 'Oxygen level (SpO₂)', shortLabel: 'Oxygen level', unit: '%', icon: 'droplet', min: 70, max: 100, step: '0.1', normal: [95, 100], caution: [90, 94] },
  { key: 'heartRate', label: 'Heart rate', shortLabel: 'Heart rate', unit: 'bpm', icon: 'assessment', min: 30, max: 220, step: '1', normal: [60, 100], caution: [50, 119] },
  { key: 'systolic', label: 'Blood pressure – top', shortLabel: 'BP (top)', unit: 'mmHg', icon: 'gauge', min: 60, max: 250, step: '1', normal: [90, 139], caution: [85, 159] },
  { key: 'diastolic', label: 'Blood pressure – bottom', shortLabel: 'BP (bottom)', unit: 'mmHg', icon: 'gauge', min: 30, max: 150, step: '1', normal: [60, 89], caution: [55, 99] },
  { key: 'temperature', label: 'Temperature', shortLabel: 'Temperature', unit: '°F', icon: 'thermometer', min: 86, max: 110, step: '0.1', normal: [97, 99.5], caution: [96, 100.9] },
];

const MONITORING_COPY = {
  normal: { variant: 'forest', label: 'Looks close to normal' },
  anomaly: { variant: 'danger', label: 'Noticeably different from normal' },
};

const TREND_COPY = {
  Improving: { variant: 'forest', label: 'Trending toward normal' },
  Stable: { variant: 'gold', label: 'Stable' },
  'Requires Attention': { variant: 'danger', label: 'Requires attention' },
  'Insufficient Data': { variant: 'muted', label: 'Insufficient data' },
};

function ScoreGauge({ percent, variant, size = 92 }) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(Number(percent)) ? Number(percent) : 0));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const animated = ready ? clamped : 0;

  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - animated / 100);

  return (
    <svg className="score-gauge" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${clamped}% close to normal`}>
      <circle className="score-gauge-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
      <circle
        className={`score-gauge-fill score-gauge-${variant}`}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="51%" textAnchor="middle" dominantBaseline="middle" className="score-gauge-value">
        {clamped}%
      </text>
    </svg>
  );
}

function TrendDot(props) {
  const { cx, cy, index, dataLength, stroke, onClick } = props;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const isLast = index === dataLength - 1;
  return (
    <g style={{ cursor: 'pointer' }} onClick={onClick}>
      {isLast && <circle cx={cx} cy={cy} r={5} className="trend-dot-pulse" style={{ fill: stroke }} />}
      <circle cx={cx} cy={cy} r={isLast ? 5 : 3.5} fill={stroke} stroke="var(--color-surface)" strokeWidth={1.5} />
    </g>
  );
}

function ChartTooltip({ active, payload, formatter }) {
  if (!active || !payload?.length) return null;
  const recordedAt = payload[0]?.payload?.recordedAt;
  return (
    <div className="chart-tooltip">
      {recordedAt && <div className="chart-tooltip-date">{recordedAt}</div>}
      {payload.map((item) => (
        <div className="chart-tooltip-row" key={item.dataKey}>
          <span className="chart-tooltip-dot" style={{ background: item.color }} />
          <span className="chart-tooltip-label">{item.name}</span>
          <strong className="chart-tooltip-value">{formatter ? formatter(item.value) : item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function vitalStatus(field, rawValue) {
  const value = Number(rawValue);
  if (rawValue === '' || rawValue === undefined || !Number.isFinite(value)) return null;
  if (value >= field.normal[0] && value <= field.normal[1]) return 'normal';
  if (value >= field.caution[0] && value <= field.caution[1]) return 'caution';
  return 'concern';
}

// The drift score is 0 (matches the healthy baseline) to 1 (far from it) —
// backwards for a patient-facing number, where higher should mean better.
// Flip it to a 0-100 "closeness to normal" percentage everywhere it's shown.
function closenessPercent(score) {
  const clamped = Math.max(0, Math.min(1, Number(score) || 0));
  return Math.round((1 - clamped) * 100);
}

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
    errors.systolic = 'The top number must be higher than the bottom number.';
    errors.diastolic = 'The bottom number must be lower than the top number.';
  }
  return errors;
}

export default function PatientAssessment() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [result, setResult] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
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
      setSelectedEntry(null);
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
    closeness: closenessPercent(entry.anomalyScore),
    recordedAt: formatRecordedAt(entry.createdAt),
    entry,
  })).filter((row) => Number.isFinite(row.score)), [history]);

  const trajectorySummary = useMemo(() => {
    if (!chartData.length) return null;
    const latestPercent = chartData[chartData.length - 1].closeness;
    const previousPercent = chartData.length > 1 ? chartData[chartData.length - 2].closeness : null;
    const stepDelta = previousPercent === null ? null : latestPercent - previousPercent;
    return {
      count: chartData.length,
      latestPercent,
      latestDirection: latestPercent >= 50 ? 'up' : 'down',
      stepDelta,
      stepDirection: stepDelta === null ? 'flat' : stepDelta > 1 ? 'up' : stepDelta < -1 ? 'down' : 'flat',
    };
  }, [chartData]);

  // Improvement compares how close the very first check-in was to normal
  // against how close the latest one is — in the same "closeness %" terms
  // as everything else on this page, so the numbers stay comparable.
  const improvement = useMemo(() => {
    if (chartData.length < 2) return null;
    const delta = chartData[chartData.length - 1].closeness - chartData[0].closeness;
    const direction = delta > 1 ? 'up' : delta < -1 ? 'down' : 'flat';
    return { delta, direction };
  }, [chartData]);

  const shownResult = selectedEntry || result;
  const latestTrend = shownResult?.trendLabel && TREND_COPY[shownResult.trendLabel]
    ? TREND_COPY[shownResult.trendLabel]
    : TREND_COPY['Insufficient Data'];
  const monitoring = shownResult?.anomalyLabel === 'normal' ? MONITORING_COPY.normal : MONITORING_COPY.anomaly;

  return (
    <PatientDashboardShell>
      <div className="patient-assessment-page">
      <GlassLensFilter />
      <PageHeader title="Assessment" subtitle="Record your vitals to track your recovery trend." />

      {loadError && (
        <div className="mb-6">
          <Alert variant={history.length ? 'warning' : 'danger'}>
            {loadError}
            <div className="mt-3">
              <Button type="button" variant="secondary" size="sm" onClick={() => loadHistory({ preserve: true })} disabled={refreshing || loadingHistory}>
                {refreshing ? 'Refreshing…' : 'Retry'}
              </Button>
            </div>
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-6 mb-6">
        <Panel title="Record current vitals">
          <form onSubmit={submit} noValidate className="space-y-5" aria-describedby="assessment-disclaimer">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {VITAL_FIELDS.map((field) => (
                  <div key={field.key} className={field.key === 'temperature' ? 'sm:col-span-2' : ''}>
                    <label className="vital-field-label field-label" htmlFor={`assessment-${field.key}`}>
                      <span className="vital-field-icon"><NavIcon name={field.icon} size={16} /></span>
                      <span className="vital-field-text">{field.label}</span>
                      <span className="vital-field-unit">{field.unit}</span>
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
                      aria-describedby={fieldErrors[field.key] ? `assessment-${field.key}-error` : undefined}
                    />
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
                Clear
              </Button>
              <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                {busy ? 'Processing…' : 'Run assessment'}
              </Button>
            </div>

            <p id="assessment-disclaimer" className="medical-disclaimer">
              Automated assessment supports monitoring only — it does not diagnose illness or replace clinical judgment.
            </p>
          </form>
        </Panel>

        <Panel
          title={selectedEntry ? 'Selected assessment' : 'Latest monitoring result'}
          subtitle={shownResult ? formatRecordedAt(shownResult.createdAt) : 'No assessment recorded yet.'}
          action={selectedEntry ? <Button variant="ghost" size="sm" onClick={() => setSelectedEntry(null)}>Back to latest</Button> : null}
        >
          {loadingHistory && !shownResult ? (
            <div className="py-10 text-center text-[var(--color-text-soft)]" aria-live="polite">Loading assessment history…</div>
          ) : !shownResult ? (
            <EmptyState title="No assessment recorded yet" subtitle="Enter your measured vitals to create your first monitoring result." />
          ) : (
            <div ref={resultRef} tabIndex={-1} className="space-y-5 outline-none" aria-live="polite">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={monitoring.variant}>{monitoring.label}</Badge>
                <Badge variant={latestTrend.variant}>{latestTrend.label}</Badge>
              </div>

              <div className="assessment-result-summary" role="status" aria-live="polite">
                <ScoreGauge percent={closenessPercent(shownResult.anomalyScore)} variant={monitoring.variant === 'forest' ? 'forest' : 'danger'} />
                <div>
                  <span className="assessment-result-score-label">Close to normal</span>
                  <p>
                    {shownResult.anomalyLabel === 'normal'
                      ? 'These vitals closely match a typical healthy recovery pattern.'
                      : 'These vitals show a noticeable difference from a typical healthy recovery pattern.'}
                  </p>
                </div>
              </div>

              <div className="assessment-vitals-grid">
                {VITAL_FIELDS.filter((f) => f.key !== 'diastolic').map((field) => {
                  if (field.key === 'systolic') {
                    const sysStatus = vitalStatus(field, shownResult.systolic);
                    const diaField = VITAL_FIELDS.find((f) => f.key === 'diastolic');
                    const diaStatus = vitalStatus(diaField, shownResult.diastolic);
                    const status = sysStatus === 'concern' || diaStatus === 'concern' ? 'concern' : sysStatus === 'caution' || diaStatus === 'caution' ? 'caution' : sysStatus && diaStatus ? 'normal' : null;
                    return (
                      <div key="bp" data-status={status}>
                        <div className="vital-tile-top"><NavIcon name="gauge" size={16} /><span>Blood pressure</span></div>
                        <strong>{displayNumber(shownResult.systolic, 0)} / {displayNumber(shownResult.diastolic, 0)} mmHg</strong>
                      </div>
                    );
                  }
                  const status = vitalStatus(field, shownResult[field.key]);
                  return (
                    <div key={field.key} data-status={status}>
                      <div className="vital-tile-top"><NavIcon name={field.icon} size={16} /><span>{field.shortLabel}</span></div>
                      <strong>{displayNumber(shownResult[field.key])} {field.unit}</strong>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel className="mb-6" title="Recovery progress" subtitle="How close to normal your vitals have been at each check-in — click a point to review it above.">
        {chartData.length < 2 ? (
          <EmptyState title="Not enough check-ins yet" subtitle="Record a few more assessments to see your recovery trend over time." />
        ) : (
          <div>
            {trajectorySummary && (
              <div className="assessment-trajectory-summary" role="status" aria-live="polite">
                <div><span>Check-ins recorded</span><strong>{trajectorySummary.count}</strong></div>
                <div className="assessment-improvement-stat" data-direction={trajectorySummary.latestDirection}>
                  <span>Latest check-in</span>
                  <strong>{trajectorySummary.latestPercent}% close to normal</strong>
                </div>
                <div className="assessment-improvement-stat" data-direction={trajectorySummary.stepDirection}>
                  <span>Since last check-in</span>
                  <strong>
                    {trajectorySummary.stepDelta === null
                      ? 'Not available yet'
                      : trajectorySummary.stepDirection === 'flat'
                        ? 'About the same'
                        : `${Math.abs(trajectorySummary.stepDelta)}% ${trajectorySummary.stepDelta >= 0 ? 'closer to normal' : 'further from normal'}`}
                  </strong>
                </div>
                <div className="assessment-improvement-stat" data-direction={improvement?.direction || 'flat'}>
                  <span>Since you started monitoring</span>
                  <strong>
                    {!improvement ? 'Not available' : improvement.direction === 'flat' ? 'About the same' : `${Math.abs(improvement.delta)}% ${improvement.delta >= 0 ? 'closer to normal' : 'further from normal'}`}
                  </strong>
                </div>
              </div>
            )}
            <div className="assessment-chart" role="img" aria-label="How close to normal your vitals have been at each check-in. Refer to the table below for the recorded values.">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                  onClick={(state) => {
                    const row = state?.activePayload?.[0]?.payload;
                    if (row) setSelectedEntry(row.entry);
                  }}
                >
                  <defs>
                    <linearGradient id="driftScoreFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-crimson)" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="var(--color-crimson)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="index" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} width={40} tickFormatter={(value) => `${value}%`} />
                  <Tooltip content={<ChartTooltip formatter={(value) => `${Math.round(value)}%`} />} cursor={{ stroke: 'var(--color-crimson)', strokeDasharray: '3 3' }} />
                  <Area
                    type="monotone"
                    dataKey="closeness"
                    stroke="var(--color-crimson)"
                    strokeWidth={2.5}
                    fill="url(#driftScoreFill)"
                    name="Close to normal"
                    isAnimationActive
                    animationDuration={900}
                    animationEasing="ease-out"
                    dot={(dotProps) => (
                      <TrendDot
                        {...dotProps}
                        key={`dot-${dotProps.index}`}
                        dataLength={chartData.length}
                        onClick={() => setSelectedEntry(dotProps.payload.entry)}
                      />
                    )}
                    activeDot={{ r: 6, style: { cursor: 'pointer' } }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {refreshing && <div className="mt-3 text-sm text-[var(--color-text-soft)]" aria-live="polite">Refreshing historical assessments…</div>}
      </Panel>

      <Panel title="Check-in history" subtitle="Every recorded assessment — select a row to review it above.">
        {chartData.length === 0 ? (
          <EmptyState title="No check-ins recorded yet" subtitle="Run an assessment to start building your history." />
        ) : (
          <div className="assessment-trajectory-table-wrap" role="region" aria-label="Accessible historical assessment records">
            <table className="assessment-trajectory-table">
              <caption className="sr-only">How close to normal each check-in was, by date — select a row to view its full result above.</caption>
              <thead><tr><th scope="col">Check-in</th><th scope="col">Recorded</th><th scope="col">Close to normal</th></tr></thead>
              <tbody>
                {chartData.slice(-8).map((row) => (
                  <tr
                    key={`${row.index}-${row.recordedAt}`}
                    className={selectedEntry === row.entry ? 'is-selected' : ''}
                    onClick={() => setSelectedEntry(row.entry)}
                    tabIndex={0}
                    role="button"
                    aria-label={`View check-in ${row.index} recorded ${row.recordedAt}`}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedEntry(row.entry); } }}
                  >
                    <td>{row.index}</td>
                    <td>{row.recordedAt}</td>
                    <td>{row.closeness}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="mt-6 text-xs text-[var(--color-muted)]">
        Not a substitute for professional care — seek clinical or emergency help for concerning symptoms regardless of this result.
      </p>
      </div>
    </PatientDashboardShell>
  );
}
