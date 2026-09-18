import { useUI, type TabId } from './store/useUI';
import { useGame, useGameState } from './store/useGame';
import TopBar from './components/TopBar';
import TabBar from './components/TabBar';
import InfoStrip from './components/InfoStrip';
import StartMenuScreen from './screens/StartMenuScreen';
import ChooseTeamScreen from './screens/ChooseTeamScreen';
import MatchScreen from './screens/MatchScreen';
import { SCREENS } from './screens';
import { userGameToday, nextUserGame, opponentOf, daysUntil, payroll, userTeam } from './selectors';
import { formatDate, formatMoney } from './format';
import styles from './App.module.css';

const TAB_TITLES: Record<TabId, { title: string; subtitle: string }> = {
  home: { title: 'Home', subtitle: 'Team overview' },
  messages: { title: 'Messages', subtitle: 'Inbox and notifications' },
  calendar: { title: 'Calendar', subtitle: 'Season schedule' },
  roster: { title: 'Roster', subtitle: 'Player list and depth chart' },
  squadHub: { title: 'Squad Hub', subtitle: 'Contracts and cap sheet' },
  training: { title: 'Training', subtitle: 'Practice plans' },
  playbook: { title: 'Playbook', subtitle: 'Tactics and set plays' },
  transfers: { title: 'Transfers', subtitle: 'Trade and free agency' },
  draft: { title: 'Draft', subtitle: 'Prospect scouting' },
  staff: { title: 'Staff', subtitle: 'Coaching and front office' },
  facilities: { title: 'Facilities', subtitle: 'Arena and training center' },
  board: { title: 'Board', subtitle: 'Ownership expectations' },
  finances: { title: 'Finances', subtitle: 'Budget and payroll' },
  standings: { title: 'Standings', subtitle: 'League table' },
  settings: { title: 'Settings', subtitle: 'Preferences' }
};

function Shell() {
  const tab = useUI((s) => s.tab);
  const setTab = useUI((s) => s.setTab);
  const s = useGameState();
  const busy = useGame((g) => g.busy);
  const doContinue = useGame((g) => g.continue);
  const Screen = SCREENS[tab];

  if (!s) return null;

  const { title, subtitle } = TAB_TITLES[tab];
  const homeTitle = tab === 'home' ? `${userTeam(s).city} ${userTeam(s).name}` : title;
  const today = userGameToday(s);
  const next = today ?? nextUserGame(s);
  const nextLabel = next
    ? (() => {
        const opp = opponentOf(s, next);
        const d = daysUntil(s, next.date);
        const side = next.home === s.userTeamId ? 'vs' : '@';
        return d <= 0 ? `${side} ${opp.abbr} today` : `${side} ${opp.abbr} in ${d} day${d === 1 ? '' : 's'}`;
      })()
    : 'Season complete';
  const unread = s.messages.filter((m) => !m.read).length;

  return (
    <div className={styles.shell}>
      <TopBar
        title={homeTitle}
        subtitle={subtitle}
        onContinue={doContinue}
        continueLabel={today ? 'Play Match' : 'Continue'}
        busy={busy}
      />
      <div className={styles.content}>
        <Screen />
      </div>
      <div className={styles.infoRow}>
        <InfoStrip nextGame={nextLabel} cash={formatMoney(payroll(s, s.userTeamId, '2026-27'))} date={formatDate(s.date)} />
      </div>
      <TabBar active={tab} onSelect={setTab} badges={{ messages: unread }} />
    </div>
  );
}

export default function App() {
  const view = useUI((s) => s.view);

  if (view === 'startMenu') return <StartMenuScreen />;
  if (view === 'chooseTeam') return <ChooseTeamScreen />;
  if (view === 'match') return <MatchScreen />;
  return <Shell />;
}
