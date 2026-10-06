import { TALKS, type Intensity, type Run, type TeamTalk } from '../../../engine/sim/live';
import styles from './MatchHud.module.css';

interface Sides { homeColor: string; awayColor: string; homeAbbr: string; awayAbbr: string }

/** Win probability split bar (home left, away right). */
export function WinBar({ wp, homeColor, awayColor, homeAbbr, awayAbbr }: Sides & { wp: number }) {
  const h = Math.round(wp * 100);
  return (
    <div className={styles.win}>
      <span className="mono-num">{homeAbbr} {h}%</span>
      <span className={styles.winTrack}>
        <span style={{ width: `${h}%`, background: homeColor }} />
        <span style={{ width: `${100 - h}%`, background: awayColor }} />
      </span>
      <span className="mono-num">{100 - h}% {awayAbbr}</span>
    </div>
  );
}

/** Momentum: net scoring over the last couple of minutes, needle swings toward whoever's on top. */
export function MomentumMeter({ value, homeColor, awayColor }: Sides & { value: number }) {
  const pct = 50 + value * 50;
  return (
    <div className={styles.mom} title="Momentum">
      <span className={styles.momLabel}>Momentum</span>
      <span className={styles.momTrack} style={{ background: `linear-gradient(90deg, ${homeColor}, rgba(255,255,255,0.08) 50%, ${awayColor})` }}>
        <span className={styles.momNeedle} style={{ left: `${100 - pct}%` }} />
      </span>
    </div>
  );
}

/** "BOS 12-2 RUN" banner while a run is on. */
export function RunBanner({ run, abbr, color }: { run: Run | null; abbr: string; color: string }) {
  if (!run) return null;
  return (
    <div key={`${run.side}-${run.a}`} className={styles.run} style={{ background: color }}>
      <span className={styles.runAbbr}>{abbr}</span>
      <span className={`${styles.runScore} mono-num`}>{run.a}-{run.b}</span>
      <span className={styles.runWord}>run</span>
    </div>
  );
}

const MODES: { v: Intensity; label: string; hint: string }[] = [
  { v: -1, label: 'Conserve', hint: 'Players save energy: slower drain, slightly worse execution.' },
  { v: 0, label: 'Balanced', hint: 'Normal effort.' },
  { v: 1, label: 'Push', hint: 'Max effort: better shots and pressure, but energy drains ~35% faster.' },
];

/** F1 Manager-style effort mode for the whole team (like fuel / ERS modes). */
export function IntensityControl({ value, onChange, disabled }: { value: Intensity; onChange: (v: Intensity) => void; disabled?: boolean }) {
  return (
    <div className={styles.modes}>
      <span className={styles.modesLabel}>Effort</span>
      {MODES.map((m) => (
        <button
          key={m.v}
          type="button"
          className={`${styles.mode} ${value === m.v ? styles[`mode${m.v === -1 ? 'Low' : m.v === 1 ? 'High' : 'Mid'}`] : ''}`}
          onClick={() => onChange(m.v)}
          title={m.hint}
          disabled={disabled}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** Timeout huddle: one message per timeout. */
export function TeamTalkPicker({ used, active, onPick }: { used: boolean; active: TeamTalk | null; onPick: (t: TeamTalk) => void }) {
  return (
    <div className={styles.talk}>
      <span className={styles.talkHead}>Huddle — what's the message?</span>
      <div className={styles.talkRow}>
        {(Object.keys(TALKS) as TeamTalk[]).map((t) => (
          <button key={t} type="button" className={`${styles.talkCard} ${active === t ? styles.talkOn : ''}`} disabled={used} onClick={() => onPick(t)}>
            <span className={styles.talkLabel}>{TALKS[t].label}</span>
            <span className={styles.talkHint}>{TALKS[t].hint}</span>
          </button>
        ))}
      </div>
      {used && <span className={styles.talkDone}>Message delivered{active ? `: "${TALKS[active].label}"` : ''}. It lasts the next few trips.</span>}
    </div>
  );
}
