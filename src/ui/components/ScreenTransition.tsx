import type { ReactNode } from 'react';
import styles from './ScreenTransition.module.css';

interface Props {
  tabKey: string;
  children: ReactNode;
}

/** Wraps the shell's current screen; fades + slides slightly on tab change (keyed by tab). */
export default function ScreenTransition({ tabKey, children }: Props) {
  return (
    <div className={styles.wrap}>
      <div key={tabKey} className={`${styles.inner} fade-in slide-up`}>
        {children}
      </div>
    </div>
  );
}
