import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useUI, type TabId } from './store/useUI';
import { useGame, useGameState } from './store/useGame';
import Band from './components/shell/Band';
import { uniform } from './components/shell/teamColors';
import ContinueWidget from './components/ContinueWidget';
import EventModal from './components/EventModal';
import PlayerPage from './components/PlayerPage';
import ScreenTransition from './components/ScreenTransition';
import Toasts from './components/Toasts';
import StartMenuScreen from './screens/StartMenuScreen';
import ChooseTeamScreen from './screens/ChooseTeamScreen';
import MatchScreen from './screens/MatchScreen';
import CareerSummary from './screens/CareerSummary';
import BetweenJobsScreen from './screens/BetweenJobsScreen';
import { SCREENS } from './screens';
import { userTeam } from './selectors';
import { pendingUserEvent } from '../engine/events';
import { extendCareer } from '../engine/offseason';
import { computeAccent } from './accent';
import { play } from './sound';
import styles from './App.module.css';

/** Tabs that require an active job — show a "between jobs" empty state while unemployed. */
const UNEMPLOYED_LOCKED = new Set<TabId>([
  'transfers', 'training', 'playbook', 'squadHub', 'staff', 'facilities', 'board', 'finances', 'draft', 'locker'
]);

/** Delegated button-sound listener, mounted once at the app root. */
function useButtonSounds() {
  useEffect(() => {
    let lastHover = 0;
    const onPointerDown = (e: PointerEvent) => {
      const target = (e.target as HTMLElement)?.closest?.('button, [role="button"]') as HTMLElement | null;
      if (!target) return;
      const mode = target.dataset.sound;
      if (mode === 'none') return;
      play(mode === 'confirm' ? 'confirm' : 'click');
    };
    const onPointerOver = (e: PointerEvent) => {
      const target = (e.target as HTMLElement)?.closest?.('[data-sound-hover]') as HTMLElement | null;
      if (!target) return;
      const now = performance.now();
      if (now - lastHover < 120) return;
      lastHover = now;
      play('hover');
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerover', onPointerOver);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerover', onPointerOver);
    };
  }, []);
}

function Shell() {
  const tab = useUI((s) => s.tab);
  const setTab = useUI((s) => s.setTab);
  const s = useGameState();
  const busy = useGame((g) => g.busy);
  const doContinue = useGame((g) => g.continue);
  const reset = useGame((g) => g.reset);
  const mutate = useGame((g) => g.mutate);
  const setView = useUI((s) => s.setView);
  const activeEventId = useUI((s) => s.activeEventId);
  const openEvent = useUI((s) => s.openEvent);
  const closeEvent = useUI((s) => s.closeEvent);
  const playerId = useUI((s) => s.playerId);
  const closePlayer = useUI((s) => s.closePlayer);
  const Screen = SCREENS[tab];
  const pending = s ? pendingUserEvent(s) : undefined;
  const seenPendingId = useRef<string | null>(null);

  useEffect(() => {
    if (pending && pending.id !== seenPendingId.current) {
      seenPendingId.current = pending.id;
      openEvent(pending.id);
    }
    if (!pending) seenPendingId.current = null;
  }, [pending, openEvent]);

  const wasUnemployed = useRef(s?.manager.unemployed ?? false);
  useEffect(() => {
    if (!s) return;
    if (s.manager.unemployed && !wasUnemployed.current) setTab('career');
    wasUnemployed.current = s.manager.unemployed;
  }, [s?.manager.unemployed, setTab]);

  const team = s ? userTeam(s) : null;
  const accent = useMemo(
    () => computeAccent(team?.colors.primary, team?.colors.secondary),
    [team?.colors.primary, team?.colors.secondary]
  );

  if (!s) return null;

  if (s.careerOver) {
    return <CareerSummary s={s} onBack={() => { reset(); setView('startMenu'); }} onExtend={() => mutate((st) => extendCareer(st, 5))} />;
  }

  const unread = s.messages.filter((m) => !m.read).length;
  const badges: Partial<Record<TabId, number>> = {
    messages: unread,
    transfers: s.tradeOffers.length + s.bids.filter((b) => b.fromTeam === s.userTeamId && b.status === 'pending').length,
    board: s.press?.pending ? 1 : 0,
  };

  const u = uniform(team!.colors.primary, team!.colors.secondary);
  const shellStyle = {
    '--accent': accent.accent,
    '--accent-2': accent.accent2,
    '--accent-contrast': accent.accentContrast,
    '--team': u.team,
    '--team-2': u.trim,
    '--team-ink': u.ink
  } as CSSProperties;

  return (
    <div className={styles.shell} style={shellStyle}>
      <Band s={s} tab={tab} onSelect={setTab} badges={badges} continueSlot={<ContinueWidget s={s} busy={busy} onContinue={doContinue} />} />
      <div className={styles.content}>
        <ScreenTransition tabKey={tab}>
          {s.manager.unemployed && UNEMPLOYED_LOCKED.has(tab) ? <BetweenJobsScreen tab={tab} /> : <Screen />}
        </ScreenTransition>
      </div>
      {activeEventId && <EventModal s={s} eventId={activeEventId} onClose={closeEvent} />}
      {playerId && <PlayerPage s={s} playerId={playerId} onClose={closePlayer} />}
    </div>
  );
}

export default function App() {
  const view = useUI((s) => s.view);
  useButtonSounds();

  return (
    <>
      {view === 'startMenu' && <StartMenuScreen />}
      {view === 'chooseTeam' && <ChooseTeamScreen />}
      {view === 'match' && <MatchScreen />}
      {view === 'shell' && <Shell />}
      <Toasts />
    </>
  );
}
