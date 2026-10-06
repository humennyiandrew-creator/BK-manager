import type { GameState } from '../../../engine/model';
import { computePowerRankings } from '../../../engine/news';
import { standings } from '../../../engine/season';
import BkImage from '../BkImage';
import styles from './PowerRankings.module.css';

interface Props { s: GameState; comp?: string; limit?: number; detailed?: boolean }

/** Weekly power rankings with movement since last week; the user's club is always shown. */
export default function PowerRankings({ s, comp, limit = 10, detailed }: Props) {
  const league = comp ?? s.teams[s.userTeamId].league ?? 'NBA';
  const ranks = s.powerRankings?.ranks[league]?.length ? s.powerRankings.ranks[league] : computePowerRankings(s, league);
  const prev = s.powerRankings?.prev[league] ?? [];
  const rows = new Map(standings(s, undefined, league).map((r) => [r.teamId, r]));
  const shown = ranks.slice(0, limit);
  const mineIdx = ranks.indexOf(s.userTeamId);
  if (mineIdx >= limit) shown.push(s.userTeamId);
  return (
    <div className={styles.list}>
      {shown.map((id) => {
        const i = ranks.indexOf(id);
        const t = s.teams[id];
        const r = rows.get(id);
        const before = prev.indexOf(id);
        const move = before < 0 ? 0 : before - i;
        const gp = r ? r.w + r.l : 0;
        return (
          <div key={id} className={`${styles.row} ${id === s.userTeamId ? styles.mine : ''} ${i >= limit ? styles.gap : ''}`}>
            <span className={`${styles.rank} mono-num`}>{i + 1}</span>
            <span className={`${styles.move} ${move > 0 ? styles.up : move < 0 ? styles.down : ''}`}>{move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : '–'}</span>
            <BkImage path={t.logo} alt={t.abbr} className={styles.logo} />
            <span className={styles.name}>{detailed ? `${t.city} ${t.name}` : t.name}</span>
            {r && <span className={`${styles.rec} mono-num`}>{r.w}-{r.l}</span>}
            {detailed && r && <span className={`${styles.net} mono-num ${r.pf - r.pa >= 0 ? styles.up : styles.down}`}>{gp ? `${r.pf - r.pa >= 0 ? '+' : ''}${((r.pf - r.pa) / gp).toFixed(1)}` : '—'}</span>}
            {detailed && r && <span className={`${styles.l10} mono-num`}>{r.last10[0]}-{r.last10[1]}</span>}
          </div>
        );
      })}
    </div>
  );
}
