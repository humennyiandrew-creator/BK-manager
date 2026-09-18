import Panel from '../components/Panel';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import BkImage from '../components/BkImage';
import type { GameState, SeasonRecord } from '../../engine/model';
import styles from './CareerSummary.module.css';

const isPlayoffResult = (result: string) => result !== 'Missed playoffs' && result !== 'Lost in Play-In';

function playerName(s: GameState, id: string): string {
  const p = s.players[id];
  return p ? `${p.firstName[0]}. ${p.lastName}` : '—';
}

export default function CareerSummary({ s, onBack }: { s: GameState; onBack: () => void }) {
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
    { key: 'rank', header: 'Conf Rank', align: 'right', render: (r) => `#${r.confRank}` },
    { key: 'result', header: 'Result', render: (r) => r.result },
    { key: 'objective', header: 'Objective', render: (r) => r.objective },
    { key: 'met', header: 'Met', align: 'right', render: (r) => (r.objectiveMet ? '✓' : '✗') },
    { key: 'mvp', header: 'MVP', render: (r) => playerName(s, r.awards.mvp) },
    { key: 'top', header: 'Leading Scorer', render: (r) => (r.topScorer.id ? `${playerName(s, r.topScorer.id)} (${r.topScorer.ppg})` : '-') }
  ];

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <BkImage path={team.logo} alt={team.name} className={styles.logo} />
        <div>
          <div className={styles.title}>{team.city} {team.name}</div>
          <div className={styles.subtitle}>{s.startYear}–{s.startYear + s.maxSeasons} Career Summary</div>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{titles}</span>
          <span className={styles.statLabel}>Titles</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{playoffApps}/{history.length}</span>
          <span className={styles.statLabel}>Playoff Appearances</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{objectivesMet}/{history.length}</span>
          <span className={styles.statLabel}>Objectives Met</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{totalW}-{totalL}</span>
          <span className={styles.statLabel}>Total Record</span>
        </div>
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

      <button type="button" className={styles.backBtn} onClick={onBack}>Back to Menu</button>
    </div>
  );
}
