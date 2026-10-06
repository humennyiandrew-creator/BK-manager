import type { ReactNode } from 'react';
import styles from './Panel.module.css';

interface Props {
  title: string;
  headerRight?: ReactNode;
  flush?: boolean;
  reveal?: boolean;
  className?: string;
  children: ReactNode;
}

export default function Panel({ title, headerRight, flush, className, children }: Props) {
  return (
    <section className={`${styles.panel} ${className ?? ''}`}>
      <div className={styles.head}>
        <span className={styles.title}>{title}</span>
        {headerRight}
      </div>
      <div className={flush ? `${styles.body} ${styles.bodyFlush}` : styles.body}>{children}</div>
    </section>
  );
}
