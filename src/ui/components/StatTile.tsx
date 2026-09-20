import CountUp from './CountUp';
import styles from './StatTile.module.css';

interface Props {
  label: string;
  value: number;
  formatter?: (v: number) => string;
  delta?: number;
  deltaFormatter?: (v: number) => string;
  className?: string;
}

/** Label + big animated value + optional delta chip (F1-Manager stat card). */
export default function StatTile({ label, value, formatter, delta, deltaFormatter, className }: Props) {
  const hasDelta = delta != null && delta !== 0;
  const positive = (delta ?? 0) > 0;
  const deltaText = hasDelta ? (deltaFormatter ? deltaFormatter(delta!) : `${positive ? '+' : ''}${delta}`) : null;

  return (
    <div className={`${styles.tile} ${className ?? ''}`}>
      <span className={styles.label}>{label}</span>
      <div className={styles.valueRow}>
        <CountUp value={value} formatter={formatter} className={`${styles.value} mono-num`} />
        {hasDelta && (
          <span className={positive ? `${styles.delta} ${styles.up}` : `${styles.delta} ${styles.down}`}>
            {positive ? '▲' : '▼'} {deltaText}
          </span>
        )}
      </div>
    </div>
  );
}
