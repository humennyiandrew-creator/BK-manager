import { useState } from 'react';
import Panel from '../components/Panel';
import PlayerCard from '../components/PlayerCard';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import TeamBadge from '../components/TeamBadge';
import BkImage from '../components/BkImage';
import ProgressBar from '../components/ProgressBar';
import { IconCalendar, IconTraining, IconStaff } from '../components/tabIcons';
import { useGameState } from '../store/useGame';
import { useUI } from '../store/useUI';
import { formatDate } from '../format';
import { useTransfersNav } from '../store/useTransfersNav';
import {
  userTeam, topPlayers, playerRankOnTeam, conferenceRank, teamStrengthRank, seasonObjective,
  conferenceStandings, nextUserGame, opponentOf, daysUntil, lastMeeting, teamRecord, starters,
  upcomingEvents, type UpcomingEvent
} from '../selectors';
import type { GameState, Player, SeasonRecord } from '../../engine/model';
import type { StandingRow } from '../../engine/season';
import { offseasonStageLabel } from '../../engine/offseason';
import styles from './HomeScreen.module.css';

const eventIcon: Record<UpcomingEvent['icon'], typeof IconCalendar> = {
  game: IconCalendar,
  injury: IconStaff,
  league: IconTraining
};

const OFFSEASON_STAGES = ['Season Review', 'Draft', 'Re-sign', 'Free Agency', 'Training Camp', 'New Season'] as const;

function offseasonStageIndex(s: GameState): number {
  const st = s.offseason?.stage;
  if (!st) return 0;
  if (st === 'draft') return 1;
  if (st === 'resign') return 2;
  if (st === 'fa') return 3;
  return 4; // camp
}

function OffseasonPanel({ s }: { s: GameState }) {
  const setTab = useUI((u) => u.setTab);
  const idx = offseasonStageIndex(s);
  const st = s.offseason?.stage;

  const hint = !st
    ? 'Press Continue to finalize the season and open the draft lottery.'
    : st === 'draft'
    ? 'Scout the board and make your picks when it’s your turn on the clock.'
    : st === 'resign'
    ? 'Re-sign your own expiring free agents before the market opens July 1.'
    : st === 'fa'
    ? 'Sign free agents to fill out next season’s roster.'
    : 'Progression and retirements run on your next Continue.';

  const jump = !st ? null
    : st === 'draft' ? { label: 'Go to Draft', fn: () => setTab('draft') }
    : st === 'resign' ? { label: 'Go to Squad Hub', fn: () => setTab('squadHub') }
    : st === 'fa' ? { label: 'Go to Free Agents', fn: () => { useTransfersNav.getState().requestTab('fa'); setTab('transfers'); } }
    : null;

  return (
    <Panel title="Offseason" className={styles.offseasonPanel}>
      <div className={styles.stageTimeline}>
        {OFFSEASON_STAGES.map((label, i) => (
          <div key={label} className={styles.stageStep}>
            <div className={i < idx ? `${styles.stageDot} ${styles.stageDotDone}` : i === idx ? `${styles.stageDot} ${styles.stageDotActive}` : styles.stageDot} />
            <span className={i === idx ? `${styles.stageLabel} ${styles.stageLabelActive}` : styles.stageLabel}>{label}</span>
            {i < OFFSEASON_STAGES.length - 1 && <div className={i < idx ? `${styles.stageLine} ${styles.stageLineDone}` : styles.stageLine} />}
          </div>
        ))}
      </div>
      <div className={styles.stageCurrent}>{offseasonStageLabel(s)}</div>
      <div className={styles.stageHint}>{hint}</div>
      {jump && <button type="button" className={styles.stageJumpBtn} onClick={jump.fn}>{jump.label}</button>}
    </Panel>
  );
}

function LastSeasonPanel({ s }: { s: GameState }) {
  const rec: SeasonRecord | undefined = s.history[s.history.length - 1];
  if (!rec) {
    return (
      <Panel title="Last Season" className={styles.lastSeasonPanel}>
        <div className={styles.lastSeasonEmpty}>No completed seasons yet.</div>
      </Panel>
    );
  }
  const awardRow = (label: string, id: string | null) => {
    const p = id ? s.players[id] : null;
    return (
      <div className={styles.awardRow}>
        <BkImage path={p?.face ?? null} alt={p?.lastName ?? label} className={styles.awardFace} />
        <div className={styles.awardInfo}>
          <span className={styles.awardLabel}>{label}</span>
          <span className={styles.awardName}>{p ? `${p.firstName[0]}. ${p.lastName}` : '—'}</span>
        </div>
      </div>
    );
  };
  return (
    <Panel title={`${rec.season} Recap`} className={styles.lastSeasonPanel}>
      <div className={styles.lastSeasonHead}>
        <span className={styles.lastSeasonRecord}>{rec.w}-{rec.l}</span>
        <span className={styles.lastSeasonResult}>{rec.result}</span>
      </div>
      <div className={styles.lastSeasonObjective}>
        <span>{rec.objective}</span>
        <span className={rec.objectiveMet ? styles.objectiveMet : styles.objectiveMissed}>{rec.objectiveMet ? '✓ Met' : '✗ Missed'}</span>
      </div>
      <div className={styles.awardsGrid}>
        {awardRow('MVP', rec.awards.mvp)}
        {awardRow('DPOY', rec.awards.dpoy)}
        {awardRow('ROY', rec.awards.roy)}
        {awardRow('6MOY', rec.awards.sixth)}
        {awardRow('MIP', rec.awards.mip)}
      </div>
    </Panel>
  );
}

export default function HomeScreen() {
  const s = useGameState();
  const openEvent = useUI((u) => u.openEvent);
  const [conference, setConference] = useState<'East' | 'West'>(s ? userTeam(s).conference : 'East');
  if (!s) return null;

  const team = userTeam(s);
  const rank = conferenceRank(s);
  const strengthRank = teamStrengthRank(s, s.userTeamId);
  const top2 = topPlayers(s, s.userTeamId, 2);
  const next = nextUserGame(s);
  const five = starters(s, s.userTeamId);
  const events = upcomingEvents(s);
  const pendingEvents = s.events.filter((e) => !e.resolved && e.teamId === s.userTeamId);

  const rows = conferenceStandings(s, conference);
  const columns: DataTableColumn<StandingRow>[] = [
    { key: 'rank', header: '#', render: (r) => rows.findIndex((x) => x.teamId === r.teamId) + 1 },
    { key: 'team', header: 'Team', render: (r) => <TeamBadge logoPath={s.teams[r.teamId].logo} name={s.teams[r.teamId].abbr} /> },
    { key: 'w', header: 'W', align: 'right', render: (r) => r.w },
    { key: 'l', header: 'L', align: 'right', render: (r) => r.l },
    { key: 'gb', header: 'GB', align: 'right', render: (r) => (r.gb ? r.gb.toFixed(1) : '-') },
    { key: 'streak', header: 'Streak', align: 'right', render: (r) => (r.streak === 0 ? '-' : `${r.streak > 0 ? 'W' : 'L'}${Math.abs(r.streak)}`) }
  ];

  return (
    <div className={styles.grid}>
      <div className={styles.col}>
        <Panel title="Board">
          <div className={styles.boardTeam}>
            <BkImage path={team.logo} alt={team.name} className={styles.boardLogo} />
            <span className={styles.boardTeamName}>{team.city} {team.name}</span>
          </div>
          <div className={styles.confidenceLabel}>
            <span>Conference Rank</span>
            <span>#{rank || '-'}</span>
          </div>
          <ProgressBar value={Math.max(0, 16 - rank)} max={15} variant="cyan" />
          <div className={styles.objective}>
            <span className={styles.objectiveLabel}>Season Objective</span>
            <span className={styles.objectiveValue}>{seasonObjective(strengthRank)}</span>
          </div>
          <div className={styles.objective}>
            <span className={styles.objectiveLabel}>League Strength Rank</span>
            <span className={styles.objectiveValue}>#{strengthRank} of 30</span>
          </div>
        </Panel>

        <div className={styles.playerRow}>
          {top2.map((p) => (
            <PlayerCard
              key={p.id}
              rank={playerRankOnTeam(s, p)}
              facePath={p.face}
              firstName={p.firstName}
              lastName={p.lastName}
              subtitle={`${p.positions[0]} · ${p.ratings.ovr} OVR`}
            />
          ))}
        </div>
      </div>

      <div className={styles.col}>
        <Panel
          title="Standings"
          className={styles.standingsPanel}
          flush
          headerRight={
            <div className={styles.tabsRight}>
              {(['East', 'West'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={c === conference ? `${styles.confTab} ${styles.confTabActive}` : styles.confTab}
                  onClick={() => setConference(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          }
        >
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.teamId} highlightedRowKey={s.userTeamId} compact />
        </Panel>

        {s.phase === 'offseason' ? <OffseasonPanel s={s} /> : <Panel title="Next Opponent">
          {!next && <div className={styles.objectiveValue}>Season complete</div>}
          {next && (() => {
            const opp = opponentOf(s, next);
            const [w, l] = teamRecord(s, opp.id);
            const d = daysUntil(s, next.date);
            const last = lastMeeting(s, opp.id);
            return (
              <div className={styles.opponentBody}>
                <BkImage path={opp.logo} alt={opp.name} className={styles.opponentLogo} />
                <div className={styles.opponentInfo}>
                  <div className={styles.opponentName}>{opp.city} {opp.name}</div>
                  <div className={styles.opponentMeta}>{w}-{l} record this season</div>
                  {last && (
                    <div className={styles.opponentMeta}>
                      Last meeting: {last.result!.home}-{last.result!.away} ({last.home === s.userTeamId ? 'W' : 'A'})
                    </div>
                  )}
                </div>
                <div className={styles.countdown}>
                  <span className={styles.countdownNum}>{d <= 0 ? 'Today' : d}</span>
                  {d > 0 && <span className={styles.countdownLabel}>Days</span>}
                </div>
              </div>
            );
          })()}
        </Panel>}
      </div>

      <div className={styles.col}>
        {s.phase === 'offseason' ? <LastSeasonPanel s={s} /> : <Panel title="Starting Five">
          <div className={styles.startersList}>
            {five.map((p: Player) => (
              <div key={p.id} className={styles.starterRow}>
                <BkImage path={p.face} alt={p.lastName} className={styles.starterFace} />
                <div className={styles.starterInfo}>
                  <span className={styles.starterName}>{p.firstName[0]}. {p.lastName}</span>
                  <span className={styles.starterMeta}>{p.positions[0]} · {p.ratings.ovr} OVR</span>
                </div>
                {p.injury ? (
                  <span className={styles.injuryChip}>{p.injury.name}</span>
                ) : (
                  <div className={styles.staminaWrap}>
                    <ProgressBar value={p.ratings.attrs.stamina} variant="cyan" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>}

        <Panel title="Upcoming Events" className={styles.eventsPanel}>
          {pendingEvents.length > 0 && (
            <div className={styles.eventGroup}>
              <div className={styles.eventGroupLabel}>Decision Needed</div>
              {pendingEvents.map((ev) => (
                <button key={ev.id} type="button" className={styles.pendingEventRow} onClick={() => openEvent(ev.id)}>
                  <div className={styles.eventText}>
                    <div className={styles.eventTitle}>{ev.title}</div>
                    <div className={styles.eventSubtitle}>Decide by {formatDate(ev.expires)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {events.map((group) => (
            <div key={group.group} className={styles.eventGroup}>
              <div className={styles.eventGroupLabel}>{group.group}</div>
              {group.events.map((ev) => {
                const Icon = eventIcon[ev.icon];
                return (
                  <div key={ev.id} className={styles.event}>
                    <div className={styles.eventIcon}>
                      <Icon />
                    </div>
                    <div className={styles.eventText}>
                      <div className={styles.eventTitle}>{ev.title}</div>
                      <div className={styles.eventSubtitle}>{ev.subtitle}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
