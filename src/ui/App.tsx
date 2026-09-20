import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useUI } from './store/useUI';
import { useGame, useGameState } from './store/useGame';
import TopBar from './components/TopBar';
import TabBar from './components/TabBar';
import InfoStrip from './components/InfoStrip';
import ContinueWidget from './components/ContinueWidget';
import EventModal from './components/EventModal';
import ScreenTransition from './components/ScreenTransition';
import Toasts from './components/Toasts';
import StartMenuScreen from './screens/StartMenuScreen';
import ChooseTeamScreen from './screens/ChooseTeamScreen';
import MatchScreen from './screens/MatchScreen';
import CareerSummary from './screens/CareerSummary';
import { SCREENS } from './screens';
import { userGameToday, nextUserGame, opponentOf, daysUntil, userTeam } from './selectors';
import { formatDate } from './format';
import { offseasonStageLabel } from '../engine/offseason';
import { pendingUserEvent } from '../engine/events';
import { computeAccent } from './accent';
import { play } from './sound';
import styles from './App.module.css';

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
  const setView = useUI((s) => s.setView);
  const activeEventId = useUI((s) => s.activeEventId);
  const openEvent = useUI((s) => s.openEvent);
  const closeEvent = useUI((s) => s.closeEvent);
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

  const team = s ? userTeam(s) : null;
  const accent = useMemo(
    () => computeAccent(team?.colors.primary, team?.colors.secondary),
    [team?.colors.primary, team?.colors.secondary]
  );

  if (!s) return null;

  if (s.careerOver) {
    return <CareerSummary s={s} onBack={() => { reset(); setView('startMenu'); }} />;
  }

  const today = userGameToday(s);
  const next = today ?? nextUserGame(s);
  const nextLabel = s.phase === 'offseason'
    ? offseasonStageLabel(s)
    : next
    ? (() => {
        const opp = opponentOf(s, next);
        const d = daysUntil(s, next.date);
        const side = next.home === s.userTeamId ? 'vs' : '@';
        return d <= 0 ? `${side} ${opp.abbr} today` : `${side} ${opp.abbr} in ${d} day${d === 1 ? '' : 's'}`;
      })()
    : 'Season complete';
  const unread = s.messages.filter((m) => !m.read).length;

  const accentStyle = {
    '--accent': accent.accent,
    '--accent-2': accent.accent2,
    '--accent-contrast': accent.accentContrast
  } as CSSProperties;

  return (
    <div className={styles.shell} style={accentStyle}>
      <TopBar continueSlot={<ContinueWidget s={s} busy={busy} onContinue={doContinue} />} />
      <div className={styles.content}>
        <ScreenTransition tabKey={tab}>
          <Screen />
        </ScreenTransition>
      </div>
      <div className={styles.infoRow}>
        <InfoStrip nextGame={nextLabel} cash={s.finance.cash} date={formatDate(s.date)} />
      </div>
      <TabBar active={tab} onSelect={setTab} badges={{ messages: unread }} />
      {activeEventId && <EventModal s={s} eventId={activeEventId} onClose={closeEvent} />}
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
