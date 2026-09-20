import type { ComponentType, ReactNode } from 'react';
import styles from './SideRail.module.css';

export interface SideRailItem<T extends string> {
  id: T;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  badge?: number;
}

interface Props<T extends string> {
  items: SideRailItem<T>[];
  active: T;
  onSelect: (id: T) => void;
  footer?: ReactNode;
  className?: string;
}

/** Vertical context rail (like F1 Manager's F1/F2/F3 series switcher) for in-screen sections. */
export default function SideRail<T extends string>({ items, active, onSelect, footer, className }: Props<T>) {
  return (
    <nav className={`${styles.rail} ${className ?? ''}`}>
      {items.map(({ id, label, icon: Icon, badge }) => (
        <button
          key={id}
          type="button"
          className={id === active ? `${styles.item} ${styles.active}` : styles.item}
          onClick={() => onSelect(id)}
          data-sound-hover
        >
          {Icon && <Icon className={styles.icon} />}
          <span className={styles.label}>{label}</span>
          {badge != null && badge > 0 && <span className={styles.badge}>{badge}</span>}
        </button>
      ))}
      {footer && <div className={styles.footer}>{footer}</div>}
    </nav>
  );
}
