import { useMemo, useState } from 'react';
import type { GameState } from '../../../engine/model';
import { awardRaces, type AwardRaces as Races } from '../../../engine/news';
import { useUI } from '../../store/useUI';
import BkImage from '../BkImage';
import styles from './AwardRaces.module.css';

const RACES: { id: keyof Races; label: string }[] = [
  { id: 'mvp', label: 'MVP' }, { id: 'roy', label: 'Rookie' }, { id: 'dpoy', label: 'Defense' }, { id: 'sixth', label: '6th Man' },
];

interface Props { s: GameState; comp?: string; limit?: number; all?: boolean }

/** Live award ladders built from this season's production. */
export default function AwardRaces({ s, comp, limit = 5, all }: Props) {
  const [race, setRace] = useState<keyof Races>('mvp');
  const races = useMemo(() => awardRaces(s, comp, limit), [s, comp, limit]);
  const openPlayer = useUI((u) => u.openPlayer);
  const ladder = (id: keyof Races) => {
    const rows = races[id];
    if (!rows.length) return <div className={styles.empty}>Not enough games played yet.</div>;
    return rows.map((r, i) => {
      const p = s.players[r.id];
      const t = p.teamId ? s.teams[p.teamId] : null;
      return (
        <button key={r.id} type="button" className={`${styles.row} ${p.teamId === s.userTeamId ? styles.mine : ''}`} onClick={() => openPlayer(p.id)}>
          <span className={`${styles.rank} mono-num`}>{i + 1}</span>
          <BkImage path={p.face} alt={p.lastName} className={styles.face} />
          <span className={styles.who}>
            <span className={styles.name}>{p.firstName[0]}. {p.lastName}</span>
            <span className={styles.team}>{t?.abbr ?? 'FA'}</span>
          </span>
          <span className={`${styles.line} mono-num`}>{r.line}</span>
        </button>
      );
    });
  };
  if (all) return (
    <div className={styles.grid}>
      {RACES.map((r) => (
        <div key={r.id} className={styles.block}>
          <div className={styles.blockTitle}>{r.label}</div>
          {ladder(r.id)}
        </div>
      ))}
    </div>
  );
  return (
    <div>
      <div className={styles.tabs}>
        {RACES.map((r) => (
          <button key={r.id} type="button" className={r.id === race ? `${styles.tab} ${styles.tabOn}` : styles.tab} onClick={() => setRace(r.id)}>{r.label}</button>
        ))}
      </div>
      {ladder(race)}
    </div>
  );
}
