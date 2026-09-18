import { useState } from 'react';
import Panel from '../components/Panel';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import TeamBadge from '../components/TeamBadge';
import { useGameState } from '../store/useGame';
import { conferenceStandings } from '../selectors';
import type { StandingRow } from '../../engine/season';
import type { Series } from '../../engine/model';
import styles from './StandingsScreen.module.css';

function StandingsTable({ rows, teams, userTeamId }: { rows: StandingRow[]; teams: Record<string, { abbr: string; logo: string }>; userTeamId: string }) {
  const columns: DataTableColumn<StandingRow & { rank: number }>[] = [
    { key: 'rank', header: '#', render: (r) => r.rank },
    { key: 'team', header: 'Team', render: (r) => <TeamBadge logoPath={teams[r.teamId].logo} name={teams[r.teamId].abbr} /> },
    { key: 'w', header: 'W', align: 'right', render: (r) => r.w },
    { key: 'l', header: 'L', align: 'right', render: (r) => r.l },
    { key: 'pct', header: 'PCT', align: 'right', render: (r) => r.pct.toFixed(3) },
    { key: 'gb', header: 'GB', align: 'right', render: (r) => (r.gb ? r.gb.toFixed(1) : '-') },
    { key: 'home', header: 'Home', align: 'right', render: (r) => `${r.home[0]}-${r.home[1]}` },
    { key: 'away', header: 'Away', align: 'right', render: (r) => `${r.away[0]}-${r.away[1]}` },
    { key: 'conf', header: 'Conf', align: 'right', render: (r) => `${r.conf[0]}-${r.conf[1]}` },
    { key: 'l10', header: 'L10', align: 'right', render: (r) => `${r.last10[0]}-${r.last10[1]}` },
    { key: 'strk', header: 'Strk', align: 'right', render: (r) => (r.streak === 0 ? '-' : `${r.streak > 0 ? 'W' : 'L'}${Math.abs(r.streak)}`) },
    { key: 'pfg', header: 'PF/G', align: 'right', render: (r) => (r.pf / Math.max(1, r.w + r.l)).toFixed(1) },
    { key: 'pag', header: 'PA/G', align: 'right', render: (r) => (r.pa / Math.max(1, r.w + r.l)).toFixed(1) },
    { key: 'diff', header: 'Diff', align: 'right', render: (r) => ((r.pf - r.pa) / Math.max(1, r.w + r.l)).toFixed(1) }
  ];
  const withRank = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  return (
    <DataTable
      columns={columns}
      rows={withRank}
      rowKey={(r) => r.teamId}
      highlightedRowKey={userTeamId}
      rowClass={(r) => (r.rank === 6 ? styles.playoffLine : r.rank === 10 ? styles.playinLine : undefined)}
      compact
    />
  );
}

function SeriesBox({ se, teams }: { se: Series; teams: Record<string, { abbr: string; logo: string }> }) {
  const high = teams[se.high]?.abbr ?? se.high;
  const low = teams[se.low]?.abbr ?? se.low;
  return (
    <div className={styles.seriesBox}>
      <div className={se.winner === se.high ? `${styles.seriesTeam} ${styles.seriesWinner}` : styles.seriesTeam}>
        <span>{high}</span><span>{se.winsHigh}</span>
      </div>
      <div className={se.winner === se.low ? `${styles.seriesTeam} ${styles.seriesWinner}` : styles.seriesTeam}>
        <span>{low}</span><span>{se.winsLow}</span>
      </div>
    </div>
  );
}

function Bracket({ series, teams }: { series: Series[]; teams: Record<string, { abbr: string; logo: string }> }) {
  const playin = series.filter((x) => x.kind === 'playin');
  const rounds = [1, 2, 3].map((r) => series.filter((x) => x.kind === 'playoff' && x.round === r));
  const finals = series.find((x) => x.round === 4);
  return (
    <div className={styles.bracket}>
      {(['East', 'West'] as const).map((conf) => (
        <div key={conf} className={styles.bracketConf}>
          <div className={styles.bracketConfTitle}>{conf}</div>
          {playin.filter((x) => x.conf === conf).length > 0 && (
            <div className={styles.bracketRound}>
              <div className={styles.bracketRoundTitle}>Play-In</div>
              {playin.filter((x) => x.conf === conf).map((se) => <SeriesBox key={se.id} se={se} teams={teams} />)}
            </div>
          )}
          {rounds.map((round, i) => {
            const list = round.filter((x) => x.conf === conf);
            if (!list.length) return null;
            return (
              <div key={i} className={styles.bracketRound}>
                <div className={styles.bracketRoundTitle}>Round {i + 1}</div>
                {list.map((se) => <SeriesBox key={se.id} se={se} teams={teams} />)}
              </div>
            );
          })}
        </div>
      ))}
      <div className={styles.bracketConf}>
        <div className={styles.bracketConfTitle}>Finals</div>
        {finals && <div className={styles.bracketRound}><SeriesBox se={finals} teams={teams} /></div>}
      </div>
    </div>
  );
}

export default function StandingsScreen() {
  const s = useGameState();
  const [tab, setTab] = useState<'East' | 'West' | 'Bracket'>('East');
  if (!s) return null;

  const showBracket = s.phase === 'playin' || s.phase === 'playoffs' || s.phase === 'offseason';
  const teams = s.teams;

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs}>
        {(['East', 'West'] as const).map((c) => (
          <button key={c} type="button" className={tab === c ? `${styles.tab} ${styles.tabActive}` : styles.tab} onClick={() => setTab(c)}>
            {c}ern Conference
          </button>
        ))}
        {showBracket && (
          <button type="button" className={tab === 'Bracket' ? `${styles.tab} ${styles.tabActive}` : styles.tab} onClick={() => setTab('Bracket')}>
            Bracket
          </button>
        )}
      </div>
      <Panel title={tab === 'Bracket' ? 'Postseason Bracket' : `${tab}ern Conference`} className={styles.panel} flush>
        {tab !== 'Bracket' && <StandingsTable rows={conferenceStandings(s, tab)} teams={teams} userTeamId={s.userTeamId} />}
        {tab === 'Bracket' && <Bracket series={s.series} teams={teams} />}
      </Panel>
    </div>
  );
}
