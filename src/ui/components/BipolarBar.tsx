import styles from './BipolarBar.module.css';

interface Props {
  label: string;
  value: number;  // -100..100
  className?: string;
}

/** Centered -100..100 fit bar: fills right of center when positive, left when negative. */
export default function BipolarBar({ label, value, className }: Props) {
  const v = Math.max(-100, Math.min(100, value));
  const pct = Math.abs(v) / 2; // 0..50
  const color = v >= 15 ? 'var(--positive)' : v <= -15 ? 'var(--negative)' : 'var(--text-muted)';
  return (
    <div className={`${styles.wrap} ${className ?? ''}`}>
      <div className={styles.labelRow}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value} style={{ color }}>{v > 0 ? '+' : ''}{v}</span>
      </div>
      <div className={styles.track}>
        <div className={styles.center} />
        <div
          className={styles.fill}
          style={{
            left: v >= 0 ? '50%' : `${50 - pct}%`,
            width: `${pct}%`,
            background: color
          }}
        />
      </div>
    </div>
  );
}
