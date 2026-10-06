import type { MatchObjective } from '../../../engine/model';
import { formatMoneyShort } from '../../format';
import styles from './ObjectiveList.module.css';

export type ObjStatus = 'met' | 'failed' | 'on' | 'off' | 'pending';
const STATUS_LABEL: Record<ObjStatus, string> = { met: 'Met', failed: 'Missed', on: 'On track', off: 'Behind', pending: '' };

interface Props {
  list: MatchObjective[];
  status?: (o: MatchObjective) => { status: ObjStatus; value?: number };
  compact?: boolean;
}

/** Sponsor match objectives with reward and (optionally) live or final status. */
export default function ObjectiveList({ list, status, compact }: Props) {
  return (
    <div className={compact ? `${styles.list} ${styles.compact}` : styles.list}>
      {list.map((o) => {
        const st = status?.(o) ?? { status: 'pending' as ObjStatus };
        return (
          <div key={o.id} className={`${styles.row} ${styles[st.status]}`}>
            <span className={styles.mark} aria-hidden="true" />
            <div className={styles.text}>
              <span className={styles.label}>{o.label}</span>
              {!compact && <span className={styles.sponsor}>{o.sponsor}</span>}
            </div>
            {st.value != null && <span className={`${styles.value} mono-num`}>{o.stat === 'fgPct' ? `${st.value}%` : o.stat === 'win' ? (st.value ? 'W' : '–') : st.value}</span>}
            <span className={`${styles.reward} mono-num`}>{formatMoneyShort(o.reward)}</span>
            {st.status !== 'pending' && <span className={styles.pill}>{STATUS_LABEL[st.status]}</span>}
          </div>
        );
      })}
    </div>
  );
}
