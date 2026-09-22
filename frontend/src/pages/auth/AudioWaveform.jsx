const BARS = Array.from({ length: 60 }, (_, i) => i);

// Deterministic silhouette so bars read as an actual waveform, not uniform blocks.
function barHeight(i) {
  return 18 + 55 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.35));
}

export default function AudioWaveform() {
  return (
    <div className="login-waveform" aria-hidden="true">
      {BARS.map((i) => (
        <span
          key={i}
          style={{
            height: `${barHeight(i)}%`,
            animationDelay: `${(i % 14) * 0.12}s`,
            animationDuration: `${1.4 + (i % 5) * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}
