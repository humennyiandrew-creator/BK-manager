import type { ReactNode } from 'react';
import styles from './TopBar.module.css';

interface Props {
  continueSlot?: ReactNode;
}

/** Slim shell chrome strip: help chip + the ContinueWidget. Per-screen titles live in HeroHeader. */
export default function TopBar({ continueSlot }: Props) {
  return (
    <div className={styles.bar}>
      <span className={styles.help}>
        <span className={styles.helpKey}>H</span> Help
      </span>
      {continueSlot}
    </div>
  );
}
