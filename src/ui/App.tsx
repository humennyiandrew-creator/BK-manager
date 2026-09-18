import { useUI, type TabId } from './store/useUI';
import TopBar from './components/TopBar';
import TabBar from './components/TabBar';
import InfoStrip from './components/InfoStrip';
import StartMenuScreen from './screens/StartMenuScreen';
import ChooseTeamScreen from './screens/ChooseTeamScreen';
import { SCREENS } from './screens';
import { userTeam, nextOpponent, daysUntilNextGame, cashOnHand, gameDate } from './data/fakeData';
import styles from './App.module.css';

const TAB_TITLES: Record<TabId, { title: string; subtitle: string }> = {
  home: { title: 'Home', subtitle: `${userTeam.name} overview` },
  messages: { title: 'Messages', subtitle: 'Inbox and notifications' },
  calendar: { title: 'Calendar', subtitle: 'Season schedule' },
  roster: { title: 'Roster', subtitle: 'Player list and depth chart' },
  squadHub: { title: 'Squad Hub', subtitle: 'Team chemistry and morale' },
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
  const Screen = SCREENS[tab];
  const { title, subtitle } = TAB_TITLES[tab];

  return (
    <div className={styles.shell}>
      <TopBar title={title} subtitle={subtitle} onContinue={() => {}} />
      <div className={styles.content}>
        <Screen />
      </div>
      <div className={styles.infoRow}>
        <InfoStrip nextGame={`vs ${nextOpponent.abbr} in ${daysUntilNextGame} days`} cash={cashOnHand} date={gameDate} />
      </div>
      <TabBar active={tab} onSelect={setTab} badges={{ messages: 3 }} />
    </div>
  );
}

export default function App() {
  const view = useUI((s) => s.view);

  if (view === 'startMenu') return <StartMenuScreen />;
  if (view === 'chooseTeam') return <ChooseTeamScreen />;
  return <Shell />;
}
