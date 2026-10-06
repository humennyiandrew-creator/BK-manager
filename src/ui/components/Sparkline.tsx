interface Props {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

/** Minimal inline SVG sparkline, no axes. */
export default function Sparkline({ values, width = 120, height = 26, color = 'var(--accent)' }: Props) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const pad = 2;
  const pts = values.map((v, i) => `${i * step},${pad + (height - pad * 2) * (1 - (v - min) / range)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
