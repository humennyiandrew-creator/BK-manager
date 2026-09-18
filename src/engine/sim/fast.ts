// Possession core. decide() rolls a possession into events (pure w.r.t. stats), commit() books them.
// Fast sim = decide+commit in a loop. Live sim = decide, animate, commit each event on its beat.
import type { BoxLine, GameResult, Player, TeamState } from '../model';
import { emptyLine } from '../model';
import { gauss, type Rng } from '../rng';
import { available } from '../rotation';
import { PLAY_BY_ID } from '../playbook/plays';
import { SCHEMES, SYSTEMS } from '../playbook/systems';
import type { Play, Role, ShotType } from '../playbook/types';
import { defenseFit, lineupProfile, offenseFit, type DefFit, type OffFit, type Profile } from '../playbook/fit';

export type { ShotType };
export interface Rules { periods: number; periodSec: number; otSec: number; foulOut: number; bonusAt: number }
export const NBA_RULES: Rules = { periods: 4, periodSec: 720, otSec: 300, foulOut: 6, bonusAt: 5 };

/** Tuning knobs — calibrated by src/engine/__tests__/calibration.test.ts. */
export const K = {
  possSec: 14.0,
  toBase: 0.127,
  stealShare: 0.56,
  nsFoul: 0.085,
  threeMul: 0.86,
  base: { rim: 0.66, mid: 0.428, three: 0.314 },
  skill: { rim: 0.0065, mid: 0.006, three: 0.0036 },
  def: { rim: 0.004, mid: 0.003, three: 0.002 },
  block: { rim: 0.095, mid: 0.025, three: 0.008 },
  sfoul: { rim: 0.2, mid: 0.06, three: 0.018 },
  andOne: 0.55,
  assist: { rim: 0.55, mid: 0.48, three: 0.85 },
  orb: 0.24,
  homeEdge: 0.012,
  create: 0.0022,
  offIQ: 0.0015,
  help: 0.003,
  usgExp: 1.6,
  drain: 0.00085,
  recover: 0.0016,
  playFocus: 0.9,   // how strongly play options steer shooter choice
  playShot: 0.45,   // chance the shot type comes from the play instead of player tendency
  playEdge: 0.02,   // make-prob bonus when play beats the scheme (penalty when weak)
  breakBonus: 0.07, // fast-break rim bonus
};

export interface SP {
  p: Player;
  line: BoxLine;
  energy: number;       // 0–1
  target: number;       // target minutes
  sec: number;          // seconds played
}

export interface Side {
  team: TeamState;
  roster: SP[];
  court: SP[];          // sorted by position → index+1 = Role
  pts: number;
  fouls: number;        // team fouls this period
  home: boolean;
}

const a = (sp: SP) => sp.p.ratings.attrs;
const avg = (list: SP[], f: (sp: SP) => number) => list.reduce((s, x) => s + f(x), 0) / list.length;
const posRank = (sp: SP) => ({ PG: 0, SG: 1, SF: 2, PF: 3, C: 4 })[sp.p.positions[0] ?? 'SF'];
export const roleOf = (s: Side, sp: SP) => (s.court.indexOf(sp) + 1) as Role;

export function pick<T>(list: T[], w: (x: T) => number, rng: Rng): T {
  const ws = list.map((x) => Math.max(0.0001, w(x)));
  let r = rng() * ws.reduce((s, x) => s + x, 0);
  for (let i = 0; i < list.length; i++) if ((r -= ws[i]) <= 0) return list[i];
  return list[list.length - 1];
}

export function makeSide(team: TeamState, players: Record<string, Player>, home: boolean): Side {
  const roster = team.rotation
    .map((id) => players[id])
    .filter((p) => p && available(p))
    .map((p) => ({ p, line: { ...emptyLine(), id: p.id, starter: false }, energy: 1 - (p.fatigue ?? 0) / 250, target: team.minutes[p.id] ?? 0, sec: 0 }));
  const court = roster.slice(0, 5);
  court.forEach((sp) => (sp.line.starter = true, sp.line.gs = 1));
  return { team, roster, court: sortCourt(court), pts: 0, fouls: 0, home };
}

export const sortCourt = (c: SP[]) => c.sort((x, y) => posRank(x) - posRank(y));
const fatigue = (sp: SP) => 0.9 + 0.1 * sp.energy;

// ---------- substitutions ----------

export interface SubCtx { period: number; clock: number; margin: number }

export function doSubs(s: Side, elapsed: number, total: number, ctx: SubCtx, rules: Rules) {
  const frac = Math.min(1, elapsed / total);
  const need = (sp: SP) => sp.target * frac - sp.sec / 60;
  const eligible = (sp: SP) => sp.line.pf < rules.foulOut;
  const late = ctx.period >= rules.periods && ctx.clock <= 300;
  const garbage = ctx.period >= rules.periods && ctx.clock <= 420 && Math.abs(ctx.margin) >= 22;
  const bench = () => s.roster.filter((sp) => !s.court.includes(sp) && eligible(sp));

  if (late && !garbage && Math.abs(ctx.margin) <= 12) {
    const closers = s.roster.filter((sp) => eligible(sp) && sp.energy > 0.35).slice(0, 5);
    if (closers.length === 5) { s.court = sortCourt([...closers]); return; }
  }
  if (garbage) {
    const deep = [...bench()].sort((x, y) => s.roster.indexOf(y) - s.roster.indexOf(x));
    s.court.forEach((sp, i) => {
      if (s.roster.indexOf(sp) < 7 && deep.length) s.court[i] = deep.shift()!;
    });
    sortCourt(s.court);
    return;
  }
  for (let i = 0; i < s.court.length; i++) {
    const cur = s.court[i];
    const mustGo = !eligible(cur);
    const tired = cur.energy < 0.62 || need(cur) < -2.5 || cur.target === 0;
    if (!mustGo && !tired) continue;
    const cands = bench().filter((sp) => sp.target > 0 || mustGo);
    if (!cands.length) continue;
    const posFit = (sp: SP) => (Math.abs(posRank(sp) - posRank(cur)) <= 1 ? 2 : 0);
    const best = cands.reduce((b, sp) => (need(sp) + sp.energy * 3 + posFit(sp) > need(b) + b.energy * 3 + posFit(b) ? sp : b));
    if (mustGo || need(best) > -1.5 || cur.energy < 0.45) s.court[i] = best;
  }
  sortCourt(s.court);
}

// ---------- tactic fit (cached per lineup + tactics) ----------

interface OffC { ids: string[]; tac: string; prof: Profile; fit: OffFit }
interface DefC { ids: string[]; opp: string[]; scheme: string; fit: DefFit }
const offCache = new WeakMap<Side, OffC>();
const defCache = new WeakMap<Side, DefC>();
const sameCourt = (ids: string[], s: Side) => ids.length === s.court.length && s.court.every((x, i) => x.p.id === ids[i]);

export function sideFit(s: Side): { prof: Profile; fit: OffFit } {
  const t = s.team.tactics;
  const tac = `${t.offense}|${t.threeFocus}|${t.crashGlass}|${t.pace}`;
  let c = offCache.get(s);
  const same = !!c && sameCourt(c.ids, s);
  if (!c || !same || c.tac !== tac) {
    const prof = same ? c!.prof : lineupProfile(s.court.map((x) => x.p));
    c = { ids: s.court.map((x) => x.p.id), tac, prof, fit: offenseFit(prof, t) };
    offCache.set(s, c);
  }
  return c;
}

export function schemeFit(def: Side, off: Side): DefFit {
  let c = defCache.get(def);
  if (!c || c.scheme !== def.team.tactics.defense || !sameCourt(c.ids, def) || !sameCourt(c.opp, off)) {
    c = { ids: def.court.map((x) => x.p.id), opp: off.court.map((x) => x.p.id), scheme: def.team.tactics.defense,
      fit: defenseFit(sideFit(def).prof, def.team.tactics.defense, sideFit(off).prof) };
    defCache.set(def, c);
  }
  return c.fit;
}

export function tickEnergy(s: Side, sec: number, drainMul = 1) {
  drainMul *= sideFit(s).fit.drainMul;
  for (const sp of s.roster) {
    if (s.court.includes(sp)) {
      sp.sec += sec;
      sp.energy = Math.max(0.05, sp.energy - sec * K.drain * drainMul * (1.6 - a(sp).stamina / 100));
    } else sp.energy = Math.min(1, sp.energy + sec * K.recover);
  }
}

// ---------- decide ----------

export type Ev =
  | { k: 'to'; by: SP; steal: SP | null }
  | { k: 'foul'; by: SP; on: SP; shooting: boolean }
  | { k: 'ft'; by: SP; made: boolean; n: number; of: number }
  | { k: 'shot'; by: SP; type: ShotType; made: boolean; defender: SP; block: SP | null; assist: SP | null; fastBreak: boolean }
  | { k: 'reb'; by: SP | null; off: boolean };

export interface Outcome {
  play: Play;
  handler: SP;
  events: Ev[];
  keep: boolean;        // offense keeps ball (ORB / non-bonus foul)
  transition: boolean;  // next possession starts in transition
  event: string;
}

export interface DecideCtx { transition: boolean; calledPlay?: string | null; clutch?: boolean }

export function choosePlay(off: Side, rng: Rng, ctx: DecideCtx): Play {
  const t = off.team.tactics;
  if (ctx.calledPlay && PLAY_BY_ID[ctx.calledPlay]) return PLAY_BY_ID[ctx.calledPlay];
  if (ctx.clutch && t.clutchPlay && PLAY_BY_ID[t.clutchPlay]) return PLAY_BY_ID[t.clutchPlay];
  const weights: Record<string, number> = { ...SYSTEMS[t.offense].plays, ...t.playWeights };
  if (ctx.transition) { weights.drag = (weights.drag ?? 0) + 3; weights['early-three'] = (weights['early-three'] ?? 0) + 2; }
  const ids = Object.keys(weights).filter((id) => weights[id] > 0 && PLAY_BY_ID[id]);
  return PLAY_BY_ID[ids.length ? pick(ids, (id) => weights[id], rng) : 'motion-5out'];
}

function freeThrowEvents(sp: SP, n: number, rng: Rng): Ev[] {
  const pFt = Math.min(0.95, Math.max(0.4, 0.785 + (a(sp).freeThrow - 62) * 0.0055));
  return Array.from({ length: n }, (_, i) => ({ k: 'ft' as const, by: sp, made: rng() < pFt, n: i + 1, of: n }));
}

function reboundEvent(off: Side, def: Side, rng: Rng): Ev & { k: 'reb' } {
  const t = off.team.tactics;
  void t;
  const pOrb = K.orb + SCHEMES[def.team.tactics.defense].orbAllowed + sideFit(off).fit.orbAdd
    + (avg(off.court, (x) => a(x).offRebound) - avg(def.court, (x) => a(x).defRebound)) * 0.004;
  if (rng() < pOrb) return { k: 'reb', by: pick(off.court, (x) => a(x).offRebound ** 2 * (posRank(x) + 2), rng), off: true };
  return { k: 'reb', by: rng() > 0.11 ? pick(def.court, (x) => a(x).defRebound ** 2 * (posRank(x) + 2), rng) : null, off: false };
}

/** Team-level shot quality: creation by the handler vs opponent help defense. */
export function contextEdge(handler: SP, def: SP[]): number {
  const create = (a(handler).passing + a(handler).vision + a(handler).offIQ) / 3 - 62;
  const help = avg(def, (x) => (a(x).helpD + a(x).perimeterD + a(x).interiorD) / 3) - 62;
  return create * K.create - help * K.help;
}

export function shotProb(sp: SP, defender: SP, protector: SP, type: ShotType, edge: number): number {
  const skill = type === 'rim' ? (a(sp).layup + a(sp).closeShot + a(sp).dunk) / 3 : type === 'mid' ? a(sp).midRange : a(sp).threePoint;
  const d = type === 'rim' ? (a(protector).interiorD + a(defender).interiorD) / 2 : a(defender).perimeterD;
  const p = K.base[type] + (skill - 62) * K.skill[type] - (d - 62) * K.def[type] + edge;
  return Math.min(0.92, Math.max(0.1, p * fatigue(sp)));
}

export function decide(off: Side, def: Side, rng: Rng, rules: Rules, ctx: DecideCtx): Outcome {
  const t = off.team.tactics;
  const sys = SYSTEMS[t.offense];
  const sch = SCHEMES[def.team.tactics.defense];
  const fastBreak = ctx.transition && rng() < 0.25 + t.transition / 250;
  const play = choosePlay(off, rng, ctx);
  const usage = (sp: SP) => sp.p.ratings.tend.usage ** K.usgExp * fatigue(sp);
  const handler = pick(off.court, (x) => usage(x) * (a(x).ballHandle + a(x).passing) * (roleOf(off, x) === 1 ? 1.5 : 1), rng);
  const out = (events: Ev[], keep: boolean, transition: boolean, event: string): Outcome => ({ play, handler, events, keep, transition, event });

  // Turnover
  const of = sideFit(off).fit, df = schemeFit(def, off);
  const pTo = K.toBase * sys.toMul * (1 + (sch.toMul - 1) * df.mul) * of.toMul
    * (1 + (62 - (a(handler).ballHandle + a(handler).passing) / 2) * 0.01)
    * (1 + (avg(def.court, (x) => a(x).steal) - 62) * 0.008);
  if (rng() < pTo) {
    const by = pick(off.court, (x) => usage(x) * (130 - a(x).ballHandle), rng);
    const steal = rng() < K.stealShare ? pick(def.court, (x) => a(x).steal ** 2, rng) : null;
    return out([{ k: 'to', by, steal }], false, !!steal, steal ? 'steal' : 'turnover');
  }

  // Non-shooting foul
  if (!fastBreak && rng() < K.nsFoul * sch.foulMul) {
    const by = pick(def.court, (x) => 100 - a(x).perimeterD / 2, rng);
    const ev: Ev[] = [{ k: 'foul', by, on: handler, shooting: false }];
    if (def.fouls + 1 >= rules.bonusAt) {
      const fts = freeThrowEvents(handler, 2, rng);
      ev.push(...fts);
      if (!(fts[1] as { made: boolean }).made) {
        const reb = reboundEvent(off, def, rng);
        ev.push(reb);
        return out(ev, reb.off, false, 'bonus-ft');
      }
      return out(ev, false, false, 'bonus-ft');
    }
    return out(ev, true, false, 'foul');
  }

  // Shooter: player usage steered by the play's options.
  const optW = new Map<SP, number>();
  const optTotal = play.options.reduce((s, o) => s + o.weight, 0);
  const focus = off.court.find((x) => x.p.id === t.focusPlayer) ?? null;
  const optSp = (role: Role | 'focus') => (role === 'focus' ? focus ?? off.court[0] : off.court[role - 1]);
  for (const o of play.options) {
    const sp = optSp(o.role);
    if (sp) optW.set(sp, (optW.get(sp) ?? 0) + o.weight / optTotal);
  }
  const boxed = def.team.tactics.defense === 'box1' ? focus : null;
  const out3 = (t.threeFocus - 50) / 50;
  const lean = (x: SP) => 1 + (out3 > 0 ? out3 * (a(x).threePoint - 62) : -out3 * ((a(x).layup + a(x).dunk + a(x).postScoring) / 3 - 62)) / 40;
  const shooter = fastBreak
    ? pick(off.court, (x) => usage(x) * (a(x).speed + 20), rng)
    : pick(off.court, (x) => usage(x) * (1 + (optW.get(x) ?? 0) * 5 * K.playFocus) * (x === focus ? 1.25 : 1) * (x === boxed ? 0.65 : 1) * lean(x), rng);

  let type: ShotType;
  const myOpts = play.options.filter((o) => optSp(o.role) === shooter);
  if (fastBreak) type = rng() < 0.75 ? 'rim' : 'three';
  else if (myOpts.length && rng() < K.playShot) type = pick(myOpts, (o) => o.weight, rng).shot;
  else {
    const tn = shooter.p.ratings.tend;
    const threeP = Math.min(0.88, tn.threeRate * K.threeMul * sys.threeMul * sch.threeRateMul * (1 + (t.threeFocus - 50) / 100));
    type = rng() < threeP ? 'three' : rng() < Math.min(0.95, tn.rimRate * sch.rimRateMul) ? 'rim' : 'mid';
  }

  const defender = def.court[off.court.indexOf(shooter)] ?? def.court[0];
  const protector = def.court.reduce((b, x) => (a(x).block + a(x).interiorD > a(b).block + a(b).interiorD ? x : b));
  const pts = type === 'three' ? 3 : 2;
  const schemeD = (type === 'rim' ? sch.rimD : type === 'mid' ? sch.midD : sch.threeD) * df.mul - df.leak;
  const playEdge = play.strongVs.includes(sch.id) ? K.playEdge : play.weakVs.includes(sch.id) ? -K.playEdge : 0;
  const edge = (off.home ? K.homeEdge : 0) + contextEdge(handler, def.court) + K.offIQ * (a(shooter).offIQ - 62)
    - schemeD + (fastBreak ? (type === 'rim' ? K.breakBonus : 0.02) : playEdge) - (shooter === boxed ? 0.03 : 0)
    + of.edge + (type === 'rim' ? of.rimEdge : type === 'three' ? of.threeEdge : 0)
    + ((off.team.familiarity ?? 85) - 85) / 40 * 0.006;
  const pMake = shotProb(shooter, defender, protector, type, edge);
  const passers = off.court.filter((x) => x !== shooter);
  const assistBy = (): SP | null => (rng() < K.assist[type] * sys.assistMul
    ? pick(passers, (x) => (a(x).passing * a(x).vision) ** 1.5 * x.p.ratings.tend.usage, rng) : null);

  // Shooting foul
  if (rng() < K.sfoul[type] * sch.foulMul * (0.55 + a(shooter).drawFoul / 110)) {
    const fouler = type === 'rim' && rng() < 0.5 ? protector : defender;
    const ev: Ev[] = [];
    if (rng() < pMake * K.andOne) {
      ev.push({ k: 'shot', by: shooter, type, made: true, defender, block: null, assist: assistBy(), fastBreak });
      ev.push({ k: 'foul', by: fouler, on: shooter, shooting: true }, ...freeThrowEvents(shooter, 1, rng));
      return out(ev, false, false, 'and-one');
    }
    ev.push({ k: 'foul', by: fouler, on: shooter, shooting: true });
    const fts = freeThrowEvents(shooter, pts, rng);
    ev.push(...fts);
    if (!(fts[fts.length - 1] as { made: boolean }).made) {
      const reb = reboundEvent(off, def, rng);
      ev.push(reb);
      return out(ev, reb.off, false, 'shooting-foul');
    }
    return out(ev, false, false, 'shooting-foul');
  }

  const pBlock = K.block[type] * (1 + (a(protector).block - 62) * 0.025);
  if (rng() < pBlock) {
    const reb = reboundEvent(off, def, rng);
    return out([{ k: 'shot', by: shooter, type, made: false, defender, block: type === 'rim' ? protector : defender, assist: null, fastBreak }, reb],
      reb.off, !reb.off && rng() < 0.3, 'block');
  }
  if (rng() < pMake) {
    return out([{ k: 'shot', by: shooter, type, made: true, defender, block: null, assist: assistBy(), fastBreak }], false, false, `make-${type}`);
  }
  const reb = reboundEvent(off, def, rng);
  return out([{ k: 'shot', by: shooter, type, made: false, defender, block: null, assist: null, fastBreak }, reb],
    reb.off, !reb.off && rng() < 0.18 + of.oppTransition, reb.off ? 'orb' : 'drb');
}

// ---------- commit ----------

function score(off: Side, def: Side, sp: SP, pts: number) {
  sp.line.pts += pts;
  off.pts += pts;
  off.court.forEach((x) => (x.line.pm += pts));
  def.court.forEach((x) => (x.line.pm -= pts));
}

export function commitEvent(off: Side, def: Side, ev: Ev) {
  switch (ev.k) {
    case 'to': ev.by.line.tov++; if (ev.steal) ev.steal.line.stl++; break;
    case 'foul': ev.by.line.pf++; def.fouls++; break;
    case 'ft': ev.by.line.fta++; if (ev.made) { ev.by.line.ftm++; score(off, def, ev.by, 1); } break;
    case 'shot': {
      ev.by.line.fga++;
      if (ev.type === 'three') ev.by.line.tpa++;
      if (ev.block) ev.block.line.blk++;
      if (ev.made) {
        ev.by.line.fgm++;
        if (ev.type === 'three') ev.by.line.tpm++;
        score(off, def, ev.by, ev.type === 'three' ? 3 : 2);
        if (ev.assist) ev.assist.line.ast++;
      }
      break;
    }
    case 'reb': if (ev.by) ev.by.line[ev.off ? 'orb' : 'drb']++; break;
  }
}

// ---------- game ----------

export function possessionLength(off: Side, def: Side, prev: Outcome | null, rng: Rng): number {
  if (prev?.keep && prev.event !== 'foul') return 4 + rng() * 9;
  if (prev?.transition) return 4 + rng() * 7;
  const pace = (off.team.tactics.pace + def.team.tactics.pace) / 2 + (def.team.tactics.defense === 'press' ? 8 : 0);
  const mean = K.possSec * (1 - (pace - 50) / 250);
  return Math.min(24, Math.max(4, mean + gauss(rng) * 4.5));
}

export const drainFor = (home: TeamState, away: TeamState) =>
  Math.max(SCHEMES[home.tactics.defense].drainMul, SCHEMES[away.tactics.defense].drainMul);

export function simGame(home: TeamState, away: TeamState, players: Record<string, Player>, rng: Rng, rules: Rules = NBA_RULES): GameResult {
  const H = makeSide(home, players, true), A = makeSide(away, players, false);
  const periods: [number, number][] = [];
  const total = rules.periods * rules.periodSec;
  const drain = drainFor(home, away);
  let elapsed = 0;
  let off = rng() < 0.5 ? H : A; // tip-off
  for (let period = 1; period <= rules.periods || H.pts === A.pts; period++) {
    let clock = period <= rules.periods ? rules.periodSec : rules.otSec;
    const start: [number, number] = [H.pts, A.pts];
    H.fouls = A.fouls = 0;
    if (period > 1) for (const s of [H, A]) s.roster.forEach((sp) => (sp.energy = Math.min(1, sp.energy + (period === 3 ? 0.35 : 0.18))));
    if (period > 1) off = period % 2 === 0 ? (off === H ? A : H) : off;
    let prev: Outcome | null = null;
    while (clock > 0) {
      const def = off === H ? A : H;
      if (!prev || !prev.transition) {
        const ctx = { period, clock, margin: H.pts - A.pts };
        doSubs(H, elapsed, total, ctx, rules);
        doSubs(A, elapsed, total, { ...ctx, margin: -ctx.margin }, rules);
      }
      const dur = Math.min(clock, possessionLength(off, def, prev, rng));
      tickEnergy(H, dur, drain); tickEnergy(A, dur, drain);
      clock -= dur; elapsed += dur;
      const clutch = period >= rules.periods && clock < 120 && Math.abs(H.pts - A.pts) <= 5;
      prev = decide(off, def, rng, rules, { transition: !!prev?.transition, clutch });
      for (const ev of prev.events) commitEvent(off, def, ev);
      if (!prev.keep) off = def;
    }
    periods.push([H.pts - start[0], A.pts - start[1]]);
  }
  const box = (s: Side) => s.roster.map((sp) => ({ ...sp.line, min: Math.round(sp.sec / 6) / 10, gp: sp.sec > 0 ? 1 : 0 }));
  return { home: H.pts, away: A.pts, periods, box: { home: box(H), away: box(A) } }; // caller strips box for non-user games
}
