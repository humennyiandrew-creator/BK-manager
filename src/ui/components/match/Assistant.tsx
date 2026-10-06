import type { Tip } from '../../match/assistant';
import styles from './Assistant.module.css';

interface Props { tips: Tip[]; onAct: (tip: Tip) => void; onDismiss: (tip: Tip) => void }

/** The assistant coach's headset feed, top-left of the floor. */
export default function Assistant({ tips, onAct, onDismiss }: Props) {
  if (!tips.length) return null;
  return (
    <div className={styles.box}>
      <span className={styles.head}>Assistant coach</span>
      {tips.map((t) => (
        <div key={t.id} className={`${styles.tip} ${styles[t.tone]}`}>
          <p className={styles.text}>{t.text}</p>
          <div className={styles.row}>
            {t.action && <button type="button" className={styles.act} onClick={() => onAct(t)}>{t.action.label}</button>}
            <button type="button" className={styles.dismiss} onClick={() => onDismiss(t)}>Not now</button>
          </div>
        </div>
      ))}
    </div>
  );
}
