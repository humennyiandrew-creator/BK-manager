import { useState } from 'react';
import Panel from '../components/Panel';
import PlayerCard from '../components/PlayerCard';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import TeamBadge from '../components/TeamBadge';
import BkImage from '../components/BkImage';
import ProgressBar from '../components/ProgressBar';
import { IconCalendar, IconTraining, IconStaff } from '../components/tabIcons';
import { useGameState } from '../store/useGame';
import {
  userTeam, topPlayers, playerRankOnTeam, conferenceRank, teamStrengthRank, seasonObjective,
  conferenceStandings, nextUserGame, opponentOf, daysUntil, lastMeeting, teamRecord, starters,
  upcomingEvents, type UpcomingEvent
} from '../selectors';
import type { Player } from '../../engine/model';
import type { StandingRow } from '../../engine/season';
import styles from './HomeScreen.module.css';

const eventIcon: Record<UpcomingEvent['icon'], typeof IconCalendar> = {
  game: IconCalendar,
  injury: IconStaff,
  league: IconTraining
};

export default function HomeScreen() {
  const s = useGameState();
  const [conference, setConference] = useState<'East' | 'West'>(s ? userTeam(s).conference : 'East');
  if (!s) return null;

  const team = userTeam(s);
  const rank = conferenceRank(s);
  const strengthRank = teamStrengthRank(s, s.userTeamId);
  const top2 = topPlayers(s, s.userTeamId, 2);
  const next = nextUserGame(s);
  const five = starters(s, s.userTeamId);
  const events = upcomingEvents(s);

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

        <Panel title="Next Opponent">
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
        </Panel>
      </div>

      <div className={styles.col}>
        <Panel title="Starting Five">
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
        </Panel>

        <Panel title="Upcoming Events" className={styles.eventsPanel}>
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
