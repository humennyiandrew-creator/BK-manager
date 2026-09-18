import Panel from '../components/Panel';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import ProgressBar from '../components/ProgressBar';
import TeamBadge from '../components/TeamBadge';
import { useGameState, useGame } from '../store/useGame';
import { teamRoster } from '../selectors';
import { ageOf, ATTRS, type Attr } from '../../engine/ratings';
import { ATTR_LABEL } from '../attrGroups';
import type { Player, Session, TrainingFocus, TrainingPlan } from '../../engine/model';
import { SYSTEMS, SCHEMES } from '../../engine/playbook/systems';
import {
  DEFAULT_SCHEDULE, SESSION_EFFECTS, sessionOn, weekStart, scheduleGrowthMul, scheduleInjuryMul, weeklyFamiliarityGain,
} from '../../engine/training';
import { addDays } from '../../engine/schedule';
import styles from './TrainingScreen.module.css';

const FOCUS_OPTIONS: TrainingFocus[] = ['balanced', 'shooting', 'finishing', 'playmaking', 'defense', 'rebounding', 'conditioning'];
const FOCUS_LABEL: Record<TrainingFocus, string> = {
  balanced: 'Balanced', shooting: 'Shooting', finishing: 'Finishing', playmaking: 'Playmaking',
  defense: 'Defense', rebounding: 'Rebounding', conditioning: 'Conditioning',
};

const INTENSITY_TEXT: Record<number, string> = {
  1: 'Very light load — minimal growth, low fatigue and injury risk.',
  2: 'Light load — modest growth, low fatigue and injury risk.',
  3: 'Balanced load — steady growth with moderate fatigue risk.',
  4: 'Hard load — faster growth, elevated fatigue and injury risk.',
  5: 'Maximum load — fastest growth, high fatigue and injury risk.',
};

const SESSION_CYCLE: Session[] = ['high', 'light', 'shootaround', 'film', 'rest'];
const SESSION_LABEL: Record<Session, string> = { high: 'High', light: 'Light', shootaround: 'Shootaround', film: 'Film', rest: 'Rest' };
const SESSION_ICON: Record<Session, string> = { high: '\u{1F525}', light: '\u{1F7E2}', shootaround: '\u{1F3C0}', film: '\u{1F3AC}', rest: '\u{1F634}' };
const SESSION_COLOR: Record<Session, string> = {
  high: 'var(--negative)', light: 'var(--positive)', shootaround: 'var(--text-muted)', film: 'var(--cyan)', rest: 'var(--text-dim)',
};
const DAY_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function defaultPlan(): TrainingPlan {
  return { intensity: 3, focus: 'balanced', individual: {} };
}

function Sparkline({ history }: { history: Player['ovrHistory'] }) {
  const h = history ?? [];
  if (h.length < 2) return <span className={styles.sparkEmpty}>—</span>;
  const vals = h.map((x) => x.ovr);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const range = hi - lo || 1;
  const w = 60, ht = 18;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${ht - ((v - lo) / range) * ht}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${ht}`} className={styles.spark}>
      <polyline points={pts} fill="none" stroke="var(--cyan)" strokeWidth={1.5} />
    </svg>
  );
}

function ChangeArrow({ v }: { v: number | undefined }) {
  if (!v) return <span className={styles.changeFlat}>—</span>;
  if (v > 0) return <span className={styles.changeUp}>&#9650; {v}</span>;
  return <span className={styles.changeDown}>&#9660; {Math.abs(v)}</span>;
}

function fatigueColor(f: number): string {
  if (f >= 70) return 'var(--negative)';
  if (f >= 45) return 'var(--yellow, #d9a441)';
  return 'var(--positive)';
}

export default function TrainingScreen() {
  const s = useGameState();
  const mutate = useGame((g) => g.mutate);
  if (!s) return null;

  const teamId = s.userTeamId;
  const team = s.teams[teamId];
  const plan = s.training[teamId] ?? defaultPlan();
  const schedule = plan.schedule && plan.schedule.length === 7 ? plan.schedule : DEFAULT_SCHEDULE;
  const roster = teamRoster(s, teamId).slice().sort((a, b) => b.ratings.ovr - a.ratings.ovr);

  const setFocus = (focus: TrainingFocus) => mutate((st) => { st.training[teamId].focus = focus; });
  const setIntensity = (intensity: number) => mutate((st) => { st.training[teamId].intensity = intensity; });
  const setIndividual = (playerId: string, focus: TrainingFocus | '') => mutate((st) => {
    if (focus === '') delete st.training[teamId].individual[playerId];
    else st.training[teamId].individual[playerId] = focus;
  });
  const setDevPlan = (playerId: string, attr: Attr | '') => mutate((st) => {
    st.players[playerId].devPlan = attr === '' ? undefined : attr;
  });
  const cycleDay = (dayIdx: number) => mutate((st) => {
    const p = st.training[teamId];
    const cur = p.schedule && p.schedule.length === 7 ? [...p.schedule] : [...DEFAULT_SCHEDULE];
    const next = SESSION_CYCLE[(SESSION_CYCLE.indexOf(cur[dayIdx]) + 1) % SESSION_CYCLE.length];
    cur[dayIdx] = next;
    p.schedule = cur;
  });

  const start = weekStart(s.date);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const opponentFor = (date: string) => {
    const g = s.games.find((x) => x.date === date && (x.home === teamId || x.away === teamId));
    if (!g) return null;
    return s.teams[g.home === teamId ? g.away : g.home];
  };

  const growthMul = scheduleGrowthMul(s, teamId);
  const injuryMul = scheduleInjuryMul(s, teamId);
  const famGain = weeklyFamiliarityGain(s, teamId);
  const familiarity = team.familiarity ?? 60;

  const columns: DataTableColumn<Player>[] = [
    { key: 'name', header: 'Player', render: (p) => `${p.firstName} ${p.lastName}` },
    { key: 'age', header: 'Age', align: 'right', render: (p) => Math.floor(ageOf(p.birthDate)) },
    { key: 'ovr', header: 'OVR', align: 'right', render: (p) => p.ratings.ovr },
    { key: 'pot', header: 'POT', align: 'right', render: (p) => p.ratings.pot },
    { key: 'change', header: 'Last', align: 'right', render: (p) => <ChangeArrow v={p.lastChange} /> },
    { key: 'spark', header: 'Trend', render: (p) => <Sparkline history={p.ovrHistory} /> },
    {
      key: 'fatigue', header: 'Fatigue', render: (p) => {
        const f = p.fatigue ?? 0;
        return (
          <div className={styles.fatigueCell}>
            <ProgressBar value={f} max={100} className={styles.fatigueBar} variant={f >= 70 ? 'negative' : f >= 45 ? 'cyan' : 'positive'} />
            <span className={styles.fatigueNum} style={{ color: fatigueColor(f) }}>{Math.round(f)}</span>
            {f >= 70 && <span className={styles.restFlag}>Rest</span>}
          </div>
        );
      }
    },
    {
      key: 'focus', header: 'Team Focus Override', render: (p) => (
        <select
          className={styles.select}
          value={plan.individual[p.id] ?? ''}
          onChange={(e) => setIndividual(p.id, e.target.value as TrainingFocus | '')}
        >
          <option value="">Team default ({FOCUS_LABEL[plan.focus]})</option>
          {FOCUS_OPTIONS.map((f) => <option key={f} value={f}>{FOCUS_LABEL[f]}</option>)}
        </select>
      )
    },
    {
      key: 'devplan', header: 'Dev Plan', render: (p) => (
        <select
          className={styles.select}
          value={p.devPlan ?? ''}
          onChange={(e) => setDevPlan(p.id, e.target.value as Attr | '')}
          title="50% chance of +1 bonus on this attribute every positive growth tick"
        >
          <option value="">None</option>
          {ATTRS.map((a) => <option key={a} value={a}>{ATTR_LABEL[a]}</option>)}
        </select>
      )
    },
  ];

  return (
    <div className={styles.wrap}>
      <div className={styles.left}>
        <Panel title="Weekly Schedule" className={styles.weekPanel}>
          <div className={styles.weekGrid}>
            {weekDates.map((date, i) => {
              const opp = opponentFor(date);
              const session = opp ? 'shootaround' : schedule[i];
              const locked = !!opp;
              return (
                <button
                  key={date}
                  type="button"
                  className={locked ? `${styles.dayCol} ${styles.dayLocked}` : styles.dayCol}
                  onClick={() => !locked && cycleDay(i)}
                  disabled={locked}
                >
                  <span className={styles.dayLabel}>{DAY_LABEL[i]}</span>
                  <span className={styles.dayIcon} style={{ color: SESSION_COLOR[session] }}>{SESSION_ICON[session]}</span>
                  <span className={styles.daySession}>{SESSION_LABEL[session]}</span>
                  {opp && <TeamBadge logoPath={opp.logo} name={opp.abbr} className={styles.oppBadge} />}
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Training Plan" className={styles.planPanel}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Team Focus</div>
            <div className={styles.focusRow}>
              {FOCUS_OPTIONS.map((f) => (
                <button key={f} type="button" className={f === plan.focus ? styles.focusActive : styles.focusBtn} onClick={() => setFocus(f)}>
                  {FOCUS_LABEL[f]}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Intensity</div>
            <input type="range" min={1} max={5} step={1} value={plan.intensity} onChange={(e) => setIntensity(Number(e.target.value))} className={styles.slider} />
            <div className={styles.intensityScale}>{[1, 2, 3, 4, 5].map((n) => <span key={n} className={n === plan.intensity ? styles.intensityActive : undefined}>{n}</span>)}</div>
            <p className={styles.intensityText}>{INTENSITY_TEXT[plan.intensity]}</p>
          </div>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Tactical Familiarity</div>
            <ProgressBar value={familiarity} max={100} variant={familiarity >= 70 ? 'positive' : familiarity >= 40 ? 'cyan' : 'negative'} />
            <p className={styles.intensityText}>{Math.round(familiarity)}/100 with {SYSTEMS[team.tactics.offense].name} / {SCHEMES[team.tactics.defense].name}. Changing systems drops this to 35.</p>
          </div>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Weekly Effect Summary</div>
            <div className={styles.summaryRow}><span>Growth</span><span>×{growthMul.toFixed(2)}</span></div>
            <div className={styles.summaryRow}><span>Injury risk</span><span>×{injuryMul.toFixed(2)}</span></div>
            <div className={styles.summaryRow}><span>Familiarity</span><span>+{famGain.toFixed(1)}/wk</span></div>
          </div>
        </Panel>
      </div>

      <Panel title="Roster Development" className={styles.rosterPanel} flush>
        <DataTable columns={columns} rows={roster} rowKey={(p) => p.id} compact />
      </Panel>
    </div>
  );
}
