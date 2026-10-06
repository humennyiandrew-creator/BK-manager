import Panel from './Panel';
import TeamBadge from './TeamBadge';
import type { GameState, PlanId } from '../../engine/model';
import { PLAN_EFFECT, PLAN_LABEL, planIsGoodRead, setPlan, systemsVsScheme } from '../../engine/prep';
import { setResting } from '../../engine/rest';
import { startEnergy } from '../../engine/sim/fast';
import { SCHEMES, SYSTEMS } from '../../engine/playbook/systems';
import { toast } from './Toasts';
import styles from './PrepPanel.module.css';

interface Props { s: GameState; mutate: (fn: (s: GameState) => void) => void }

const PLANS = Object.keys(PLAN_LABEL) as PlanId[];

/** What the other bench's plan means for us. */
const THEIR_PLAN: Record<PlanId, (star: string) => string> = {
  'contain-star': (star) => `They will key on ${star}: fewer and harder shots for him, more room for everyone else.`,
  'take-away-three': () => 'They will run us off the line: fewer and harder threes, more room at the rim.',
  'protect-rim': () => 'They will pack the paint: harder shots at the rim, more room from three.',
  'force-turnovers': () => 'They will pressure the ball. Expect more turnovers, and more fouls from them.',
  'run-them': () => 'They will push the pace and look for fast breaks.',
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function PrepPanel({ s, mutate }: Props) {
  const prep = s.prep;
  if (!prep) return null;
  const opp = s.teams[prep.opponent];
  const star = s.players[prep.report.star];
  const ours = Object.values(s.players).filter((p) => p.teamId === s.userTeamId);
  const ourStar = ours.filter((p) => !p.injury).sort((a, b) => b.ratings.ovr - a.ratings.ovr)[0];

  const choose = (plan: PlanId) => mutate((st) => {
    const err = setPlan(st, plan);
    if (err) toast(err, 'error');
  });
  const rest = (pid: string, on: boolean) => mutate((st) => {
    const err = setResting(st, pid, on);
    if (err) toast(err, 'error');
  });

  const scheme = opp.tactics.defense;
  const vs = systemsVsScheme(scheme);
  const best = vs.filter((x) => x.score > 0).slice(0, 2);
  const worst = vs.filter((x) => x.score < 0).slice(-1)[0];
  const mineScore = vs.find((x) => x.id === s.teams[s.userTeamId].tactics.offense)?.score ?? 0;
  const tired = ours
    .filter((p) => !p.injury && !p.assigned && (startEnergy(p) < 0.78 || p.resting))
    .sort((a, b) => startEnergy(a) - startEnergy(b));
  const chosen = prep.plan;
  const good = chosen ? planIsGoodRead(s, chosen) : false;

  return (
    <Panel title="Game prep" className={styles.panel}>
      <div className={styles.opp}>
        <TeamBadge logoPath={opp.logo} name={`${opp.city} ${opp.name}`} />
      </div>
      <div className={styles.reportGrid}>
        <span>Pace</span><span>{prep.report.pace}</span>
        <span>Three rate</span><span>{pct(prep.report.threeRate)}</span>
        <span>Rim rate</span><span>{pct(prep.report.rimRate)}</span>
        <span>Star</span><span>{star ? `${star.firstName} ${star.lastName} (${star.ratings.ovr})` : '-'}</span>
        <span>Scheme</span><span>{prep.report.scheme}</span>
        <span>Weakness</span><span>{prep.report.weakness}</span>
      </div>

      {prep.theirPlan && (
        <div className={styles.theirs}>
          <span className={styles.label}>Their plan</span>
          <span>{THEIR_PLAN[prep.theirPlan](ourStar ? ourStar.lastName : 'our best player')}</span>
        </div>
      )}

      <div className={styles.counter}>
        <span className={styles.label}>Against the {SCHEMES[scheme].name.toLowerCase()}</span>
        <span>
          {best.length ? <>Our plays work best from {best.map((b) => SYSTEMS[b.id].name).join(' or ')}.</> : 'No system has a clear edge.'}
          {worst && <> {SYSTEMS[worst.id].name} struggles.</>}
          {' '}
          <span className={mineScore > 0 ? styles.good : mineScore < 0 ? styles.poor : styles.dim}>
            Ours ({SYSTEMS[s.teams[s.userTeamId].tactics.offense].name}) {mineScore > 0.15 ? 'matches up well' : mineScore < -0.05 ? 'matches up poorly' : 'is neutral'}.
          </span>
        </span>
      </div>

      <span className={styles.label}>Our plan</span>
      <div className={styles.plans}>
        {PLANS.map((id) => {
          const on = chosen === id;
          const read = planIsGoodRead(s, id);
          return (
            <button key={id} type="button" className={on ? `${styles.planBtn} ${styles.planActive}` : styles.planBtn} onClick={() => choose(id)}>
              <span className={styles.planHead}>
                <span>{PLAN_LABEL[id]}</span>
                <span className={read ? styles.good : styles.dim}>{read ? 'Good read' : 'Poor read'}</span>
              </span>
              <span className={styles.planHint}>{PLAN_EFFECT[id]}</span>
            </button>
          );
        })}
      </div>
      <p className={styles.status}>
        {chosen
          ? good ? 'Good read: the plan works in full on the night.' : 'Poor read for this opponent: the plan only works half as well.'
          : 'No plan yet. Pick one before tip-off; a good read works in full, a poor one half as well.'}
      </p>

      <span className={styles.label}>Legs</span>
      {tired.length ? (
        <div className={styles.tired}>
          {tired.map((p) => (
            <div key={p.id} className={styles.tiredRow}>
              <span className={styles.tiredName}>{p.firstName[0]}. {p.lastName}</span>
              <span className={startEnergy(p) < 0.65 ? styles.poor : styles.warn}>{p.resting ? 'Resting' : `Starts at ${pct(startEnergy(p))}`}</span>
              <button type="button" className={styles.restBtn} onClick={() => rest(p.id, !p.resting)}>{p.resting ? 'Play him' : 'Rest'}</button>
            </div>
          ))}
          <p className={styles.note}>Tired players start below full energy, tire faster and cannot recover past where they started. A night off brings fatigue down.</p>
        </div>
      ) : <p className={styles.note}>Everyone is fresh.</p>}
    </Panel>
  );
}
