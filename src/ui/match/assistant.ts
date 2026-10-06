// The assistant coach on the headset: reads the live game and suggests one-click moves,
// like the race engineer in a management game. Pure rules on the match state.
import type { LiveMatch, Snapshot } from '../../engine/sim/live';
import type { Side, SP } from '../../engine/sim/fast';
import { tiredness } from '../../engine/sim/fast';
import { SCHEMES } from '../../engine/playbook/systems';
import type { Tactics } from '../../engine/model';

export type TipTone = 'urgent' | 'warn' | 'info';
export type TipAction =
  | { kind: 'sub'; out: string; in: string; label: string }
  | { kind: 'timeout'; label: string }
  | { kind: 'intensity'; v: -1 | 0 | 1; label: string }
  | { kind: 'tactic'; patch: Partial<Tactics>; label: string };
export interface Tip { id: string; tone: TipTone; text: string; action?: TipAction }

const group = (sp: SP) => (['PG', 'SG'].includes(sp.p.positions[0]) ? 'g' : sp.p.positions[0] === 'SF' ? 'w' : 'b');
const pct = (e: number) => `${Math.round(e * 100)}%`;
const avgLegs = (s: Side) => s.court.reduce((x, sp) => x + sp.energy, 0) / Math.max(1, s.court.length);

export function assistantTips(m: LiveMatch, userSide: 0 | 1, snap: Snapshot, tactics: Tactics): Tip[] {
  if (snap.state !== 'live') return [];
  const us = userSide === 0 ? m.H : m.A, them = userSide === 0 ? m.A : m.H;
  const tips: Tip[] = [];
  const final = snap.period >= m.rules.periods;
  const margin = us.pts - them.pts;
  const bench = us.roster.filter((sp) => !us.court.includes(sp) && !sp.hurt && !sp.p.injury && sp.line.pf < m.rules.foulOut);
  // Each bench player is suggested for one sub at a time.
  const offered = new Set<SP>();
  const subFor = (out: SP) => {
    const pick = bench
      .filter((b) => b.energy >= 0.7 && !offered.has(b))
      .sort((x, y) => (y.p.ratings.ovr + (group(y) === group(out) ? 6 : 0) + y.energy * 10) - (x.p.ratings.ovr + (group(x) === group(out) ? 6 : 0) + x.energy * 10))[0];
    if (pick) offered.add(pick);
    return pick;
  };

  // Legs.
  for (const sp of us.court) {
    if (sp.energy >= 0.5) continue;
    const sub = subFor(sp);
    tips.push({
      id: `legs-${sp.p.id}`, tone: tiredness(sp) > 0.6 ? 'urgent' : 'warn',
      text: `${sp.p.lastName} is running on empty (${pct(sp.energy)}). He is shooting and defending worse every trip.${sub ? ` ${sub.p.lastName} has ${pct(sub.energy)} left on the bench.` : ''}`,
      action: sub ? { kind: 'sub', out: sp.p.id, in: sub.p.id, label: `Sub in ${sub.p.lastName}` } : undefined,
    });
  }
  // Foul trouble.
  const limit = snap.period === 1 ? 2 : snap.period === 2 ? 3 : snap.period === 3 ? 4 : m.rules.foulOut - 1;
  for (const sp of us.court) {
    if (sp.line.pf < limit || (final && snap.clock < 150)) continue;
    const sub = subFor(sp) ?? bench[0];
    tips.push({
      id: `fouls-${sp.p.id}-${sp.line.pf}`, tone: sp.line.pf >= m.rules.foulOut - 1 ? 'urgent' : 'warn',
      text: `${sp.p.lastName} has ${sp.line.pf} fouls${sp.line.pf >= m.rules.foulOut - 1 ? ': one more and he is out' : ` in the ${snap.period <= 4 ? `${['first', 'second', 'third', 'fourth'][snap.period - 1]} quarter` : 'overtime'}`}.`,
      action: sub ? { kind: 'sub', out: sp.p.id, in: sub.p.id, label: `Sit him for ${sub.p.lastName}` } : undefined,
    });
  }
  // Their run.
  if (snap.run && snap.run.side !== userSide && snap.timeouts[userSide] > 0) {
    tips.push({ id: `run-${snap.run.a}`, tone: 'urgent', text: `They are on a ${snap.run.a}–${snap.run.b} run and the building is behind them. A timeout breaks their momentum and buys some legs.`, action: { kind: 'timeout', label: 'Call timeout' } });
  }
  // A hot hand on their side.
  const hot = snap.players.filter((p) => p.side !== userSide && p.streak >= 3).sort((x, y) => y.streak - x.streak)[0];
  if (hot) tips.push({ id: `hot-${hot.id}`, tone: 'info', text: `Their ${hot.name} has hit ${hot.streak} in a row. Use the next timeout to turn up the heat on him.`, action: snap.timeouts[userSide] > 0 ? { kind: 'timeout', label: 'Call timeout' } : undefined });
  // Where they are scoring.
  const now = m.gameTime();
  const theirMakes = m.shots.filter((x) => x.side !== userSide && x.made && (x.t ?? 0) >= now - 300);
  const rim = theirMakes.filter((x) => x.rim).length;
  if (theirMakes.length >= 6 && rim / theirMakes.length >= 0.6 && !['zone23', 'drop'].includes(tactics.defense)) {
    tips.push({ id: 'paint', tone: 'warn', text: `They are living in the paint: ${rim} of their last ${theirMakes.length} baskets at the rim. A 2–3 zone packs it in.`, action: { kind: 'tactic', patch: { defense: 'zone23' }, label: 'Switch to the 2–3 zone' } });
  }
  const theirThrees = theirMakes.filter((x) => x.three).length;
  if (theirMakes.length >= 6 && theirThrees / theirMakes.length >= 0.55 && ['zone23', 'drop'].includes(tactics.defense)) {
    tips.push({ id: 'arc', tone: 'warn', text: `They are raining threes over the ${SCHEMES[tactics.defense].name.toLowerCase()} (${theirThrees} of their last ${theirMakes.length} baskets).`, action: { kind: 'tactic', patch: { defense: 'switch' }, label: 'Switch everything' } });
  }
  // Our cold shooting.
  const ourThrees = m.shots.filter((x) => x.side === userSide && x.three).slice(-8);
  const made3 = ourThrees.filter((x) => x.made).length;
  if (ourThrees.length >= 8 && made3 <= 1 && tactics.threeFocus >= 45) {
    tips.push({ id: 'cold3', tone: 'info', text: `We are ${made3} for our last ${ourThrees.length} from three. Attack the rim for a while?`, action: { kind: 'tactic', patch: { threeFocus: 30 }, label: 'Lower three-point focus' } });
  }
  // Scheme counters.
  const theirD = them.team.tactics.defense;
  if (theirD === 'switch' && tactics.offense !== 'iso') {
    tips.push({ id: 'counter-switch', tone: 'info', text: 'They switch every screen. Isolation plays punish switching: get the ball to our best scorer and clear out.', action: { kind: 'tactic', patch: { offense: 'iso' }, label: 'Go Heliocentric' } });
  }
  if ((theirD === 'man' || theirD === 'blitz') && tactics.offense === 'iso') {
    tips.push({ id: 'counter-iso', tone: 'warn', text: `Isolation struggles against their ${SCHEMES[theirD].name.toLowerCase()}. Move the ball instead.`, action: { kind: 'tactic', patch: { offense: 'pnr' }, label: 'Go pick-and-roll' } });
  }
  // Effort.
  const legs = avgLegs(us);
  const closeLate = final && snap.clock < 300 && Math.abs(margin) <= 6;
  if (snap.intensity[userSide] === 1 && legs < 0.6) {
    tips.push({ id: 'ease', tone: 'warn', text: `The legs are going (${pct(legs)} on the floor). Pushing now costs more than it gains.`, action: { kind: 'intensity', v: 0, label: 'Ease off to Balanced' } });
  } else if (closeLate && snap.intensity[userSide] !== 1 && legs >= 0.62) {
    tips.push({ id: 'push-late', tone: 'info', text: `Close game, under five minutes left and we have legs (${pct(legs)}). Time to push.`, action: { kind: 'intensity', v: 1, label: 'Push' } });
  } else if (snap.intensity[userSide] !== -1 && !final && margin >= 18) {
    tips.push({ id: 'conserve', tone: 'info', text: `Up ${margin}. Save the legs for the next game.`, action: { kind: 'intensity', v: -1, label: 'Conserve' } });
  }
  const order = { urgent: 0, warn: 1, info: 2 };
  return tips.sort((x, y) => order[x.tone] - order[y.tone]);
}
