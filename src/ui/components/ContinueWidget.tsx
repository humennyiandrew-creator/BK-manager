import type { GameState } from '../../engine/model';
import { pendingUserEvent } from '../../engine/events';
import { offseasonStageLabel } from '../../engine/offseason';
import { nextPick } from '../../engine/draft';
import { boardMeetingAvailable } from '../../engine/mgmt/board';
import { userGameToday, nextUserGame, opponentOf, daysUntil } from '../selectors';
import styles from './ContinueWidget.module.css';

const OFFSEASON_STAGE_ORDER = ['draft', 'resign', 'fa', 'camp'] as const;

interface Derived {
  label: string;
  main: string;
  sub?: string;
  days?: number;
  progress?: number; // 0-1
}

function derive(s: GameState): Derived {
  if (s.manager.unemployed) {
    const n = s.manager.offers.length;
    return { label: 'Continue', main: `Between jobs — ${n} offer${n === 1 ? '' : 's'}` };
  }

  const pendingEvent = pendingUserEvent(s);
  if (pendingEvent) {
    const d = daysUntil(s, pendingEvent.expires);
    return { label: 'Decision Needed', main: pendingEvent.title, sub: d <= 0 ? 'Expires today' : `Expires in ${d}d`, days: d };
  }

  if (s.press?.pending) {
    const q = s.press.pending;
    const left = q.questions.length - q.answered.length;
    return { label: 'Press Conference', main: 'Answer the media', sub: `${left} question${left === 1 ? '' : 's'} pending` };
  }

  const today = userGameToday(s);
  if (today) {
    const opp = opponentOf(s, today);
    const side = today.home === s.userTeamId ? 'vs' : '@';
    return { label: 'Continue', main: `${side} ${opp.abbr}`, sub: 'Today — play match', days: 0 };
  }

  if (s.phase === 'offseason') {
    const stage = s.offseason?.stage;
    const idx = stage ? OFFSEASON_STAGE_ORDER.indexOf(stage) : -1;
    const progress = (idx + 1) / (OFFSEASON_STAGE_ORDER.length + 1);
    const hint = !stage
      ? 'Finalize the season'
      : stage === 'draft'
      ? (nextPick(s)?.owner === s.userTeamId ? 'On the clock' : 'Auto-advancing draft')
      : stage === 'resign'
      ? 'Re-sign window open'
      : stage === 'fa'
      ? 'Free agency open'
      : 'Progression pending';
    return { label: 'Offseason', main: offseasonStageLabel(s), sub: hint, progress };
  }

  const next = nextUserGame(s);
  if (next) {
    const opp = opponentOf(s, next);
    const side = next.home === s.userTeamId ? 'vs' : '@';
    const d = daysUntil(s, next.date);
    return { label: 'Continue', main: `${side} ${opp.abbr}`, sub: `In ${d} day${d === 1 ? '' : 's'}`, days: d };
  }

  if (boardMeetingAvailable(s)) {
    return { label: 'Continue', main: 'Board meeting available', sub: 'Ownership will hear you out' };
  }

  return { label: 'Continue', main: 'Season complete' };
}

interface Props {
  s: GameState;
  busy?: boolean;
  onContinue: () => void;
}

/** Top-right widget naming the next thing that will happen, with a chevron-stripe motif (F1 Manager "Continue"). */
export default function ContinueWidget({ s, busy, onContinue }: Props) {
  const d = derive(s);
  return (
    <button
      type="button"
      className={busy ? `${styles.widget} ${styles.busy}` : styles.widget}
      onClick={onContinue}
      disabled={busy}
      data-sound="confirm"
    >
      <span className={`${styles.stripe} chevron-stripe`} />
      <div className={styles.body}>
        <div className={styles.topRow}>
          <span className={styles.label}>{d.label}</span>
          {d.days != null && <span className={styles.days}>{d.days <= 0 ? 'Today' : `${d.days}d`}</span>}
        </div>
        <div className={styles.main}>{busy ? 'Simulating…' : d.main}</div>
        {d.sub && !busy && <div className={styles.sub}>{d.sub}</div>}
        {d.progress != null && (
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${Math.round(d.progress * 100)}%` }} />
          </div>
        )}
      </div>
      {busy ? <span className={styles.spinner} /> : <span className={styles.chevron}>&#10148;</span>}
    </button>
  );
}
