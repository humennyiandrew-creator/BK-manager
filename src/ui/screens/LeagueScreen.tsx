import { useState } from 'react';
import HeroHeader from '../components/HeroHeader';
import Panel from '../components/Panel';
import NewsFeed from '../components/hub/NewsFeed';
import PowerRankings from '../components/hub/PowerRankings';
import AwardRaces from '../components/hub/AwardRaces';
import { useGameState } from '../store/useGame';
import { LEAGUES, type LeagueId } from '../../engine/leagues';
import type { NewsKind } from '../../engine/model';
import styles from './LeagueScreen.module.css';

const FILTERS: { id: 'all' | NewsKind[]; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: ['breakout', 'slump'], label: 'Breakouts and slumps' },
  { id: ['performance'], label: 'Big nights' },
  { id: ['streak', 'rankings', 'rivalry'], label: 'Streaks and rivalries' },
  { id: ['cup', 'allstar', 'award'], label: 'Cup, All-Star and awards' },
  { id: ['injury'], label: 'Injuries' },
  { id: ['trade', 'other'], label: 'Trades' },
];

/** League Hub: power rankings, the league wire and the award races in one place. */
export default function LeagueScreen() {
  const s = useGameState();
  const [filter, setFilter] = useState(0);
  const [comp, setComp] = useState<LeagueId | null>(null);
  if (!s) return null;
  const userComp = (s.teams[s.userTeamId].league ?? 'NBA') as LeagueId;
  const league = comp ?? userComp;
  const comps = [...new Set(Object.values(s.teams).map((t) => (t.league ?? 'NBA') as LeagueId))];
  const f = FILTERS[filter].id;
  const items = (s.news ?? []).filter((n) => f === 'all' || f.includes(n.kind));
  const updated = s.powerRankings?.date;
  return (
    <div className={styles.screen}>
      <HeroHeader
        title="League hub"
        subtitle="Power rankings, storylines and the award races"
        right={comps.length > 1 ? (
          <div className={styles.comps}>
            {comps.map((c) => (
              <button key={c} type="button" className={c === league ? `${styles.comp} ${styles.compOn}` : styles.comp} onClick={() => setComp(c)}>{LEAGUES[c].short}</button>
            ))}
          </div>
        ) : undefined}
      />
      <div className={styles.grid}>
        <Panel title={`Power rankings${updated ? `, week of ${updated.slice(5).replace('-', '/')}` : ''}`} className={styles.rankings}>
          <div className={styles.rankHead}><span>Rank</span><span>Team</span><span>W-L</span><span>Net</span><span>L10</span></div>
          <PowerRankings s={s} comp={league} limit={40} detailed />
        </Panel>
        <Panel title="League wire" className={styles.wire} headerRight={
          <div className={styles.filters}>
            {FILTERS.map((x, i) => (
              <button key={x.label} type="button" className={i === filter ? `${styles.filter} ${styles.filterOn}` : styles.filter} onClick={() => setFilter(i)}>{x.label}</button>
            ))}
          </div>
        }>
          <NewsFeed s={s} items={items} limit={60} empty="No stories in this category yet." />
        </Panel>
        <Panel title="Award races" className={styles.awards}>
          <AwardRaces s={s} comp={league} all limit={5} />
        </Panel>
      </div>
    </div>
  );
}
