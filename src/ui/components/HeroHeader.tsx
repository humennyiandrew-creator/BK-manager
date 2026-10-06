import type { ReactNode } from 'react';
import styles from './HeroHeader.module.css';

interface Props {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  /** Kept for older call sites; the page title no longer carries decoration. */
  flourish?: boolean;
  className?: string;
}

/** Quiet page title: the band above already says where you are, so this only names the page. */
export default function HeroHeader({ title, subtitle, right, className }: Props) {
  return (
    <div className={`${styles.hero} ${className ?? ''}`}>
      <div className={styles.left}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </div>
      {right && <div className={styles.right}>{right}</div>}
    </div>
  );
}
