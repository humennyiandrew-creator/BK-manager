import { useMemo, useState } from 'react';
import HeroHeader from '../components/HeroHeader';
import SideRail, { type SideRailItem } from '../components/SideRail';
import Panel from '../components/Panel';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import TeamBadge from '../components/TeamBadge';
import BkImage from '../components/BkImage';
import { IconStandings } from '../components/tabIcons';
import { useGameState } from '../store/useGame';
import { conferenceStandings } from '../selectors';
import type { StandingRow } from '../../engine/season';
import type { GameState, SeasonRecord, Series } from '../../engine/model';
import styles from './StandingsScreen.module.css';

const playerName = (s: GameState, id: string | null) => {
  const p = id ? s.players[id] : null;
  return p ? `${p.firstName[0]}. ${p.lastName}` : '—';
};

function HistoryTable({ s, rows, selected, onSelect }: { s: GameState; rows: SeasonRecord[]; selected: string; onSelect: (season: string) => void }) {
  const columns: DataTableColumn<SeasonRecord>[] = [
    { key: 'season', header: 'Season', render: (r) => r.season },
    { key: 'record', header: 'Record', align: 'right', render: (r) => `${r.w}-${r.l}` },
    { key: 'rank', header: 'Conf', align: 'right', render: (r) => `#${r.confRank}` },
    { key: 'result', header: 'Result', render: (r) => r.result },
    { key: 'objective', header: 'Objective', render: (r) => `${r.objective}${r.objectiveMet ? ' ✓' : ' ✗'}` },
    { key: 'champ', header: 'Champion', render: (r) => <TeamBadge logoPath={s.teams[r.champion]?.logo ?? null} name={s.teams[r.champion]?.abbr ?? '-'} /> },
    { key: 'mvp', header: 'MVP', render: (r) => playerName(s, r.awards.mvp) },
    { key: 'roy', header: 'ROY', render: (r) => playerName(s, r.awards.roy) },
    { key: 'dpoy', header: 'DPOY', render: (r) => playerName(s, r.awards.dpoy) }
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(r) => r.season} highlightedRowKey={selected} onRowClick={(r) => onSelect(r.season)} compact />;
}

function AllNbaTeams({ s, record }: { s: GameState; record?: SeasonRecord }) {
  if (!record) return <div className={styles.empty}>No award data</div>;
  const teams = [record.awards.allNba.slice(0, 5), record.awards.allNba.slice(5, 10), record.awards.allNba.slice(10, 15)];
  const labels = ['All-NBA 1st Team', 'All-NBA 2nd Team', 'All-NBA 3rd Team'];
  return (
    <div className={styles.allNbaWrap}>
      {teams.map((ids, i) => (
        <div key={i} className={styles.allNbaTeam}>
          <div className={styles.sectionTitle}>{labels[i]}</div>
          <div className={styles.allNbaPlayers}>
            {ids.map((id) => {
              const p = s.players[id];
              return (
                <div key={id} className={styles.allNbaPlayer}>
                  <BkImage path={p?.face ?? null} alt={p?.lastName ?? id} className={styles.allNbaFace} />
                  <span>{p ? `${p.firstName[0]}. ${p.lastName}` : id}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function StandingsTable({ rows, teams, userTeamId }: { rows: StandingRow[]; teams: Record<string, { abbr: string; logo: string }>; userTeamId: string }) {
  const columns: DataTableColumn<StandingRow & { rank: number }>[] = [
    { key: 'rank', header: '#', render: (r) => r.rank, sortValue: (r) => r.rank },
    { key: 'team', header: 'Team', render: (r) => <TeamBadge logoPath={teams[r.teamId].logo} name={teams[r.teamId].abbr} /> },
    { key: 'w', header: 'W', align: 'right', render: (r) => r.w, sortValue: (r) => r.w },
    { key: 'l', header: 'L', align: 'right', render: (r) => r.l, sortValue: (r) => r.l },
    { key: 'pct', header: 'PCT', align: 'right', render: (r) => r.pct.toFixed(3), sortValue: (r) => r.pct },
    { key: 'gb', header: 'GB', align: 'right', render: (r) => (r.gb ? r.gb.toFixed(1) : '-'), sortValue: (r) => r.gb ?? 0 },
    { key: 'home', header: 'Home', align: 'right', render: (r) => `${r.home[0]}-${r.home[1]}` },
    { key: 'away', header: 'Away', align: 'right', render: (r) => `${r.away[0]}-${r.away[1]}` },
    { key: 'conf', header: 'Conf', align: 'right', render: (r) => `${r.conf[0]}-${r.conf[1]}` },
    { key: 'l10', header: 'L10', align: 'right', render: (r) => `${r.last10[0]}-${r.last10[1]}` },
    { key: 'strk', header: 'Strk', align: 'right', render: (r) => (r.streak === 0 ? '-' : `${r.streak > 0 ? 'W' : 'L'}${Math.abs(r.streak)}`) },
    { key: 'pfg', header: 'PF/G', align: 'right', render: (r) => (r.pf / Math.max(1, r.w + r.l)).toFixed(1), sortValue: (r) => r.pf / Math.max(1, r.w + r.l) },
    { key: 'pag', header: 'PA/G', align: 'right', render: (r) => (r.pa / Math.max(1, r.w + r.l)).toFixed(1), sortValue: (r) => r.pa / Math.max(1, r.w + r.l) },
    { key: 'diff', header: 'Diff', align: 'right', render: (r) => ((r.pf - r.pa) / Math.max(1, r.w + r.l)).toFixed(1), sortValue: (r) => (r.pf - r.pa) / Math.max(1, r.w + r.l) }
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
      animateRows
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
  const [tab, setTab] = useState<'East' | 'West' | 'Bracket' | 'History'>('East');
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);

  const selectedRecord = useMemo(() => {
    if (!s) return undefined;
    return s.history.find((h) => h.season === selectedSeason) ?? s.history[s.history.length - 1];
  }, [s, selectedSeason]);

  if (!s) return null;

  const showBracket = s.phase === 'playin' || s.phase === 'playoffs' || s.phase === 'offseason';
  const teams = s.teams;

  const railItems: SideRailItem<typeof tab>[] = [
    { id: 'East', label: 'Eastern Conference', icon: IconStandings },
    { id: 'West', label: 'Western Conference', icon: IconStandings },
    ...(showBracket ? [{ id: 'Bracket' as const, label: 'Bracket', icon: IconStandings }] : []),
    ...(s.history.length > 0 ? [{ id: 'History' as const, label: 'Awards & History', icon: IconStandings }] : [])
  ];

  return (
    <div className={styles.screen}>
      <HeroHeader title="Standings" subtitle="League table" />
      <div className={styles.body}>
        <SideRail items={railItems} active={tab} onSelect={setTab} />
        <div className={styles.content}>
          {tab !== 'History' && (
            <Panel title={tab === 'Bracket' ? 'Postseason Bracket' : `${tab}ern Conference`} className={styles.panel} flush>
              {tab !== 'Bracket' && <StandingsTable rows={conferenceStandings(s, tab)} teams={teams} userTeamId={s.userTeamId} />}
              {tab === 'Bracket' && <Bracket series={s.series} teams={teams} />}
            </Panel>
          )}
          {tab === 'History' && (
            <div className={styles.historyGrid}>
              <Panel title="Season History" className={styles.historyPanel} flush>
                <HistoryTable s={s} rows={s.history} selected={selectedRecord?.season ?? ''} onSelect={setSelectedSeason} />
              </Panel>
              <Panel title={`All-NBA — ${selectedRecord?.season ?? ''}`} className={styles.allNbaPanel}>
                <AllNbaTeams s={s} record={selectedRecord} />
              </Panel>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
