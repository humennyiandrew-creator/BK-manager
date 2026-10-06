import type { Insight } from '../../insights';
import { IconAlert, IconCheck, IconFlame, IconTarget } from '../tabIcons';
import styles from './ActionItems.module.css';

const ICON = { urgent: IconAlert, warn: IconAlert, good: IconFlame, info: IconTarget };

/** The assistant coach's to-do list: each item jumps straight to where it's handled. */
export default function ActionItems({ items }: { items: Insight[] }) {
  if (!items.length) return (
    <div className={styles.clear}><IconCheck className={styles.clearIcon} /> All clear, coach. Nothing needs your attention.</div>
  );
  return (
    <div className={styles.list}>
      {items.map((it) => {
        const Icon = ICON[it.tone];
        return (
          <div key={it.id} className={`${styles.item} ${styles[it.tone]}`}>
            <Icon className={styles.icon} />
            <div className={styles.text}>
              <span className={styles.title}>{it.title}</span>
              <span className={styles.detail}>{it.detail}</span>
            </div>
            <button type="button" className={styles.cta} onClick={it.go}>{it.cta} ›</button>
          </div>
        );
      })}
    </div>
  );
}
