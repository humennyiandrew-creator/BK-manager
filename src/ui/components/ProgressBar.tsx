import styles from './ProgressBar.module.css';

type Variant = 'cyan' | 'positive' | 'negative';

interface Props {
  value: number;
  max?: number;
  variant?: Variant;
  className?: string;
}

const variantColor: Record<Variant, string> = {
  cyan: 'var(--cyan)',
  positive: 'var(--positive)',
  negative: 'var(--negative)'
};

export default function ProgressBar({ value, max = 100, variant = 'cyan', className }: Props) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`${styles.track} ${className ?? ''}`}>
      <div className={styles.fill} style={{ width: `${pct}%`, background: variantColor[variant] }} />
    </div>
  );
}
