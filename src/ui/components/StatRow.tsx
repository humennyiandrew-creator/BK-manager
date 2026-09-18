import type { ReactNode } from 'react';
import styles from './StatRow.module.css';

type Variant = 'neutral' | 'positive' | 'negative';

interface Props {
  label: string;
  value: ReactNode;
  variant?: Variant;
}

const variantClass: Record<Variant, string> = {
  neutral: 'value-neutral',
  positive: 'value-positive',
  negative: 'value-negative'
};

export default function StatRow({ label, value, variant = 'neutral' }: Props) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={`${styles.value} ${variantClass[variant]}`}>{value}</span>
    </div>
  );
}
