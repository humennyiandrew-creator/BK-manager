import type { ComponentType, ReactNode } from 'react';
import styles from './SectionCard.module.css';

interface Props {
  title?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  right?: ReactNode;
  accent?: boolean;
  glow?: boolean;
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

/** Dark slab card with header strip + thin accent edge, used to build 12-col-ish screen grids. */
export default function SectionCard({ title, icon: Icon, right, accent, glow, flush, className, children }: Props) {
  return (
    <section className={`${styles.card} ${accent ? styles.accent : ''} ${glow ? 'glow-hover' : ''} ${className ?? ''}`}>
      {title && (
        <div className={styles.head}>
          <div className={styles.headLeft}>
            {Icon && <Icon className={styles.icon} />}
            <span className={styles.title}>{title}</span>
          </div>
          {right}
        </div>
      )}
      <div className={flush ? `${styles.body} ${styles.bodyFlush}` : styles.body}>{children}</div>
    </section>
  );
}
