import { useId } from 'react';

// Filled sparkline. `data` is 0..max; fewer than 2 points renders a flat line.
export function Spark({ data, color = '#38bdf8', max = 100, height = 34 }) {
  const id = useId().replace(/:/g, '');
  const pts = data.length > 1 ? data : [0, 0];
  const w = 100;
  const step = w / Math.max(1, pts.length - 1);
  const y = (v) => height - 2 - Math.min(1, Math.max(0, v / max)) * (height - 4);
  const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.45" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Bar({ value, max = 100, color = '#38bdf8', warn = 85 }) {
  const p = Math.min(100, Math.max(0, (value / max) * 100));
  const c = p >= warn ? '#fb7185' : color;
  return (
    <div className="bar"><i style={{ width: p + '%', background: `linear-gradient(90deg, ${c}, color-mix(in srgb, ${c} 60%, #fff))` }} /></div>
  );
}

export function Ring({ value, max = 100, color = '#38bdf8', size = 86, label, sub }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, value / max));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 80 80" width={size} height={size}>
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        <circle
          cx="40" cy="40" r={r} fill="none" stroke={p > 0.85 ? '#fb7185' : color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 40 40)" style={{ transition: 'stroke-dasharray 0.6s' }}
        />
      </svg>
      <div className="ring-text"><strong>{label}</strong>{sub && <small>{sub}</small>}</div>
    </div>
  );
}
