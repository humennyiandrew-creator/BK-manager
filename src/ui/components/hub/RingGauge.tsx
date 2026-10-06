import styles from './RingGauge.module.css';

interface Props { value: number; label: string; sub?: string; size?: number; color?: string }

/** Circular 0–100 gauge with a big centre number (board confidence, chemistry, hype). */
export default function RingGauge({ value, label, sub, size = 5.4, color = 'var(--accent)' }: Props) {
  const v = Math.max(0, Math.min(100, value));
  const r = 42, c = 2 * Math.PI * r;
  return (
    <div className={styles.wrap} style={{ width: `${size}rem` }}>
      <svg viewBox="0 0 100 100" className={styles.svg}>
        <circle cx="50" cy="50" r={r} className={styles.track} />
        <circle cx="50" cy="50" r={r} className={styles.fill} stroke={color} strokeDasharray={`${(v / 100) * c} ${c}`} />
      </svg>
      <div className={styles.center}>
        <span className={`${styles.value} mono-num`}>{Math.round(v)}</span>
        {sub && <span className={styles.sub}>{sub}</span>}
      </div>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
