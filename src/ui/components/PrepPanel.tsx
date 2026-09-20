import Panel from './Panel';
import TeamBadge from './TeamBadge';
import type { GameState } from '../../engine/model';
import { setPlan } from '../../engine/prep';
import { toast } from './Toasts';
import styles from './PrepPanel.module.css';

interface Props { s: GameState; mutate: (fn: (s: GameState) => void) => void }

const PLANS: { id: 'contain-star' | 'take-away-three' | 'protect-rim' | 'force-turnovers' | 'run-them'; label: string; hint: string }[] = [
  { id: 'contain-star', label: 'Contain the Star', hint: 'Box-and-one on their top scorer.' },
  { id: 'take-away-three', label: 'Take Away the Three', hint: 'Switch everything, close out hard.' },
  { id: 'protect-rim', label: 'Protect the Rim', hint: 'Drop coverage, sag off the arc.' },
  { id: 'force-turnovers', label: 'Force Turnovers', hint: 'Full-court press.' },
  { id: 'run-them', label: 'Run With Them', hint: 'Push the pace and transition game.' },
];

export default function PrepPanel({ s, mutate }: Props) {
  const prep = s.prep;
  if (!prep) return null;
  const opp = s.teams[prep.opponent];
  const star = s.players[prep.report.star];

  const choose = (plan: (typeof PLANS)[number]['id']) => mutate((st) => {
    const err = setPlan(st, plan);
    if (err) toast(err, 'error');
  });

  return (
    <Panel title="Game Prep" className={styles.panel}>
      <div className={styles.opp}>
        <TeamBadge logoPath={opp.logo} name={`${opp.city} ${opp.name}`} />
      </div>
      <div className={styles.reportGrid}>
        <span>Pace</span><span>{prep.report.pace}</span>
        <span>3PT Rate</span><span>{Math.round(prep.report.threeRate * 100)}%</span>
        <span>Rim Rate</span><span>{Math.round(prep.report.rimRate * 100)}%</span>
        <span>Star</span><span>{star ? `${star.firstName} ${star.lastName}` : '-'}</span>
        <span>Scheme</span><span>{prep.report.scheme}</span>
        <span>Weakness</span><span>{prep.report.weakness}</span>
      </div>
      <div className={styles.plans}>
        {PLANS.map((pl) => (
          <button key={pl.id} type="button" className={prep.plan === pl.id ? `${styles.planBtn} ${styles.planActive}` : styles.planBtn} onClick={() => choose(pl.id)} title={pl.hint}>
            {pl.label}
          </button>
        ))}
      </div>
      {prep.prepared && <p className={styles.status}>Game plan set — tactics adjusted for this matchup.</p>}
    </Panel>
  );
}
