import { useState } from 'react';
import Panel from '../components/Panel';
import PlayerCard from '../components/PlayerCard';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import TeamBadge from '../components/TeamBadge';
import BkImage from '../components/BkImage';
import ProgressBar from '../components/ProgressBar';
import { IconCalendar, IconTraining, IconStaff, IconFinances, IconDraft } from '../components/tabIcons';
import {
  userTeam,
  nextOpponent,
  boardConfidence,
  seasonObjective,
  longTermObjective,
  starPlayers,
  standingsWest,
  standingsEast,
  daysUntilNextGame,
  upcomingEvents,
  type FakeStandingRow,
  type FakeEvent
} from '../data/fakeData';
import styles from './HomeScreen.module.css';

const eventIcon: Record<FakeEvent['icon'], typeof IconCalendar> = {
  game: IconCalendar,
  training: IconTraining,
  meeting: IconStaff,
  contract: IconFinances,
  scouting: IconDraft
};

const standingsColumns: DataTableColumn<FakeStandingRow>[] = [
  { key: 'rank', header: '#', render: (r) => r.rank },
  { key: 'team', header: 'Team', render: (r) => <TeamBadge logoPath={r.team.logo} name={r.team.abbr} /> },
  { key: 'w', header: 'W', align: 'right', render: (r) => r.wins },
  { key: 'l', header: 'L', align: 'right', render: (r) => r.losses },
  { key: 'gb', header: 'GB', align: 'right', render: (r) => r.gb },
  { key: 'streak', header: 'Streak', align: 'right', render: (r) => r.streak }
];

export default function HomeScreen() {
  const [conference, setConference] = useState<'East' | 'West'>('West');
  const standings = conference === 'West' ? standingsWest : standingsEast;
  const userRow = standings.find((r) => r.isUser);

  return (
    <div className={styles.grid}>
      <div className={styles.col}>
        <Panel title="Board">
          <div className={styles.boardTeam}>
            <BkImage path={userTeam.logo} alt={userTeam.name} className={styles.boardLogo} />
            <span className={styles.boardTeamName}>{userTeam.name}</span>
          </div>
          <div className={styles.confidenceLabel}>
            <span>Board Confidence</span>
            <span>{boardConfidence}%</span>
          </div>
          <ProgressBar value={boardConfidence} variant="cyan" />
          <div className={styles.objective}>
            <span className={styles.objectiveLabel}>Season Objective</span>
            <span className={styles.objectiveValue}>{seasonObjective}</span>
          </div>
          <div className={styles.objective}>
            <span className={styles.objectiveLabel}>Long-Term Objective</span>
            <span className={styles.objectiveValue}>{longTermObjective}</span>
          </div>
        </Panel>

        <div className={styles.playerRow}>
          {starPlayers.map((p) => (
            <PlayerCard
              key={p.id}
              rank={p.rank}
              rankTrend={p.rankTrend}
              facePath={p.face}
              firstName={p.firstName}
              lastName={p.lastName}
              subtitle={`${p.position} · ${p.overall} OVR`}
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
          <DataTable columns={standingsColumns} rows={standings} rowKey={(r) => r.team.id} highlightedRowKey={userRow?.team.id} compact />
        </Panel>

        <Panel title="Next Opponent">
          <div className={styles.opponentBody}>
            <BkImage path={nextOpponent.logo} alt={nextOpponent.name} className={styles.opponentLogo} />
            <div className={styles.opponentInfo}>
              <div className={styles.opponentName}>{nextOpponent.name}</div>
              <div className={styles.opponentMeta}>
                {nextOpponent.wins}-{nextOpponent.losses} record this season
              </div>
            </div>
            <div className={styles.countdown}>
              <span className={styles.countdownNum}>{daysUntilNextGame}</span>
              <span className={styles.countdownLabel}>Days</span>
            </div>
          </div>
        </Panel>
      </div>

      <div className={styles.col}>
        <Panel title="Upcoming Events" className={styles.eventsPanel}>
          {upcomingEvents.map((group) => (
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
                    <button type="button" className={styles.eventOpen} aria-label="Open">
                      &#8250;
                    </button>
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
