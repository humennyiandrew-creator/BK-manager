import Panel from '../components/Panel';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import { useGameState, useGame } from '../store/useGame';
import { teamRoster } from '../selectors';
import { ageOf } from '../../engine/ratings';
import type { Player, TrainingFocus, TrainingPlan } from '../../engine/model';
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

export default function TrainingScreen() {
  const s = useGameState();
  const mutate = useGame((g) => g.mutate);
  if (!s) return null;

  const teamId = s.userTeamId;
  const plan = s.training[teamId] ?? defaultPlan();
  const roster = teamRoster(s, teamId).slice().sort((a, b) => b.ratings.ovr - a.ratings.ovr);

  const setFocus = (focus: TrainingFocus) => mutate((st) => { st.training[teamId].focus = focus; });
  const setIntensity = (intensity: number) => mutate((st) => { st.training[teamId].intensity = intensity; });
  const setIndividual = (playerId: string, focus: TrainingFocus | '') => mutate((st) => {
    if (focus === '') delete st.training[teamId].individual[playerId];
    else st.training[teamId].individual[playerId] = focus;
  });

  const columns: DataTableColumn<Player>[] = [
    { key: 'name', header: 'Player', render: (p) => `${p.firstName} ${p.lastName}` },
    { key: 'age', header: 'Age', align: 'right', render: (p) => Math.floor(ageOf(p.birthDate)) },
    { key: 'ovr', header: 'OVR', align: 'right', render: (p) => p.ratings.ovr },
    { key: 'pot', header: 'POT', align: 'right', render: (p) => p.ratings.pot },
    { key: 'change', header: 'Last', align: 'right', render: (p) => <ChangeArrow v={p.lastChange} /> },
    { key: 'spark', header: 'Trend', render: (p) => <Sparkline history={p.ovrHistory} /> },
    {
      key: 'focus', header: 'Individual Focus', render: (p) => (
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
  ];

  return (
    <div className={styles.wrap}>
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
      </Panel>

      <Panel title="Roster Development" className={styles.rosterPanel} flush>
        <DataTable columns={columns} rows={roster} rowKey={(p) => p.id} compact />
      </Panel>
    </div>
  );
}
