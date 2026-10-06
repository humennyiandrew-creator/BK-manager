import Panel from '../components/Panel';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import BkImage from '../components/BkImage';
import StatTile from '../components/StatTile';
import type { GameState, SeasonRecord } from '../../engine/model';
import styles from './CareerSummary.module.css';

const isPlayoffResult = (result: string) => result !== 'Missed playoffs' && result !== 'Lost in Play-In';

function playerName(s: GameState, id: string): string {
  const p = s.players[id];
  return p ? `${p.firstName[0]}. ${p.lastName}` : '—';
}

export default function CareerSummary({ s, onBack, onExtend }: { s: GameState; onBack: () => void; onExtend: () => void }) {
  const team = s.teams[s.userTeamId];
  const history = s.history;
  const titles = history.filter((h) => h.result === 'Champions').length;
  const playoffApps = history.filter((h) => isPlayoffResult(h.result)).length;
  const objectivesMet = history.filter((h) => h.objectiveMet).length;
  const totalW = history.reduce((x, h) => x + h.w, 0);
  const totalL = history.reduce((x, h) => x + h.l, 0);
  const bestSeason = history.slice().sort((a, b) => b.topScorer.ppg - a.topScorer.ppg)[0];

  const columns: DataTableColumn<SeasonRecord>[] = [
    { key: 'season', header: 'Season', render: (r) => r.season },
    { key: 'record', header: 'Record', align: 'right', render: (r) => `${r.w}-${r.l}` },
    { key: 'rank', header: 'Conf rank', align: 'right', render: (r) => `#${r.confRank}` },
    { key: 'result', header: 'Result', render: (r) => r.result },
    { key: 'objective', header: 'Objective', render: (r) => r.objective },
    { key: 'met', header: 'Met', align: 'right', render: (r) => (r.objectiveMet ? 'Yes' : 'No') },
    { key: 'mvp', header: 'MVP', render: (r) => playerName(s, r.awards.mvp) },
    { key: 'top', header: 'Leading scorer', render: (r) => (r.topScorer.id ? `${playerName(s, r.topScorer.id)} (${r.topScorer.ppg})` : '-') }
  ];

  return (
    <div className={styles.wrap}>
      <div className={`${styles.header} diagonal-accent`}>
        <BkImage path={team.logo} alt={team.name} className={styles.logo} />
        <div>
          <div className={styles.title}><span className={styles.slash}>// </span>{team.city} {team.name}</div>
          <div className={styles.subtitle}>{s.startYear}–{s.startYear + s.history.length} Career Summary</div>
        </div>
      </div>

      <div className={styles.stats}>
        <StatTile label="Titles" value={titles} />
        <StatTile label="Playoff appearances" value={playoffApps} formatter={() => `${playoffApps}/${history.length}`} />
        <StatTile label="Objectives met" value={objectivesMet} formatter={() => `${objectivesMet}/${history.length}`} />
        <StatTile label="Total record" value={totalW} formatter={() => `${totalW}-${totalL}`} />
        {bestSeason && (
          <div className={styles.stat}>
            <span className={styles.statValue}>{playerName(s, bestSeason.topScorer.id)}</span>
            <span className={styles.statLabel}>Best Season ({bestSeason.topScorer.ppg} PPG, {bestSeason.season})</span>
          </div>
        )}
      </div>

      <Panel title="Season by Season" className={styles.tablePanel} flush>
        <DataTable columns={columns} rows={history} rowKey={(r) => r.season} compact />
      </Panel>

      <div className={styles.endActions}>
        <button type="button" className={styles.backBtn} onClick={onExtend}>Keep going: 5 more seasons</button>
        <button type="button" className={styles.backBtn} onClick={onBack}>Back to Menu</button>
      </div>
    </div>
  );
}
