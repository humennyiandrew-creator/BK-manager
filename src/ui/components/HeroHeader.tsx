import type { ReactNode } from 'react';
import styles from './HeroHeader.module.css';

interface Props {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  flourish?: boolean;
  className?: string;
}

/** F1-Manager-style screen title: "// TITLE" italic slab with accent bar and diagonal background wash. */
export default function HeroHeader({ title, subtitle, right, flourish = true, className }: Props) {
  return (
    <div className={`${styles.hero} ${className ?? ''} fade-in`}>
      {flourish && (
        <svg className={styles.flourish} viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 90 L120 90 L145 10 L400 10" stroke="var(--accent)" strokeWidth="1" fill="none" />
          <path d="M0 70 L90 70 L112 30 L400 30" stroke="var(--accent)" strokeWidth="1" fill="none" />
        </svg>
      )}
      <div className={styles.left}>
        <div className={styles.titleRow}>
          <span className={styles.bar} />
          <h1 className={styles.title}>
            <span className={styles.slash}>// </span>
            {title.toUpperCase()}
          </h1>
        </div>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </div>
      {right && <div className={styles.right}>{right}</div>}
    </div>
  );
}
