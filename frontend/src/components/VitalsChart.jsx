import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const METRICS = [
  { key: 'spo2', label: 'SpO₂', unit: '%', lines: [{ field: 'spo2', name: 'SpO₂', color: '#4a78be' }] },
  { key: 'bp', label: 'Blood pressure', unit: 'mmHg', lines: [{ field: 'systolic', name: 'Systolic', color: '#4a78be' }, { field: 'diastolic', name: 'Diastolic', color: '#8fb0de' }] },
  { key: 'hr', label: 'Heart rate', unit: 'bpm', lines: [{ field: 'heartRate', name: 'Heart rate', color: '#4a78be' }] },
  { key: 'temp', label: 'Temperature', unit: '°C', lines: [{ field: 'temperature', name: 'Temperature', color: '#4a78be' }] },
];
const ALERT = '#b3261e';

function shortDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

// Trend of the patient's recorded vitals, oldest to newest. Readings the
// assessment flagged as outside range are drawn as red dots.
export default function VitalsChart({ vitals }) {
  const [metricKey, setMetricKey] = useState('spo2');
  const metric = METRICS.find((item) => item.key === metricKey) || METRICS[0];

  const data = useMemo(
    () => [...vitals]
      .sort((a, b) => new Date(a.measuredAt) - new Date(b.measuredAt))
      .map((item) => ({ ...item, day: shortDate(item.measuredAt), outlier: item.anomalyLabel === 'outlier' })),
    [vitals],
  );

  if (data.length < 2) {
    return <p className="text-sm text-[var(--color-text-soft)] mb-4">A trend chart appears once the patient has recorded at least two check-ins.</p>;
  }

  return (
    <div className="mb-5">
      <div className="admin-chips mb-3" role="group" aria-label="Chart metric">
        {METRICS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`admin-chip ${metricKey === item.key ? 'is-active' : ''}`}
            aria-pressed={metricKey === item.key}
            onClick={() => setMetricKey(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="vitals-chart" role="img" aria-label={`${metric.label} over ${data.length} check-ins`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="rgba(74,120,190,0.15)" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#4a5b75' }} tickLine={false} axisLine={false} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12, fill: '#4a5b75' }} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              formatter={(value, name) => [`${value} ${metric.unit}`, name]}
              labelFormatter={(_, payload) => (payload?.[0]?.payload?.measuredAt ? new Date(payload[0].payload.measuredAt).toLocaleString() : '')}
            />
            {metric.lines.map((line) => (
              <Line
                key={line.field}
                type="monotone"
                dataKey={line.field}
                name={line.name}
                stroke={line.color}
                strokeWidth={2}
                isAnimationActive={false}
                dot={(props) => (
                  <circle key={props.index} cx={props.cx} cy={props.cy} r={props.payload.outlier ? 5 : 3.5} fill={props.payload.outlier ? ALERT : line.color} stroke="#fff" strokeWidth={1.5} />
                )}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-[var(--color-text-soft)] mt-2"><span className="vitals-legend-dot" /> Red dots are readings outside the expected range.</p>
    </div>
  );
}
