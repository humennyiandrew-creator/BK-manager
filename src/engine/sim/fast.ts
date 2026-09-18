// Possession-level game sim (no court geometry). Also the probability core the live 2D sim will reuse.
import type { BoxLine, GameResult, Player, TeamState } from '../model';
import { emptyLine } from '../model';
import { gauss, type Rng } from '../rng';
import { available } from '../rotation';

export interface Rules { periods: number; periodSec: number; otSec: number; foulOut: number; bonusAt: number }
export const NBA_RULES: Rules = { periods: 4, periodSec: 720, otSec: 300, foulOut: 6, bonusAt: 5 };

/** Tuning knobs — calibrated by src/engine/__tests__/calibration.test.ts. */
export const K = {
  possSec: 13.7,
  toBase: 0.128,
  stealShare: 0.56,
  nsFoul: 0.085,
  threeMul: 1.11,
  base: { rim: 0.69, mid: 0.455, three: 0.335 },
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
};

export type ShotType = 'rim' | 'mid' | 'three';

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
  court: SP[];
  pts: number;
  fouls: number;        // team fouls this period
  home: boolean;
}

const a = (sp: SP) => sp.p.ratings.attrs;
const avg = (list: SP[], f: (sp: SP) => number) => list.reduce((s, x) => s + f(x), 0) / list.length;
const posRank = (sp: SP) => ({ PG: 0, SG: 1, SF: 2, PF: 3, C: 4 })[sp.p.positions[0] ?? 'SF'];

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
    .map((p) => ({ p, line: { ...emptyLine(), id: p.id, starter: false }, energy: 1, target: team.minutes[p.id] ?? 0, sec: 0 }));
  const court = roster.slice(0, 5);
  court.forEach((sp) => (sp.line.starter = true, sp.line.gs = 1));
  return { team, roster, court: sortCourt(court), pts: 0, fouls: 0, home };
}

const sortCourt = (c: SP[]) => c.sort((x, y) => posRank(x) - posRank(y));
const fatigue = (sp: SP) => 0.9 + 0.1 * sp.energy;

// ---------- substitutions ----------

export function doSubs(s: Side, elapsed: number, total: number, ctx: { period: number; clock: number; margin: number }, rules: Rules) {
  const frac = Math.min(1, elapsed / total);
  const played = (sp: SP) => sp.sec / 60;
  const need = (sp: SP) => sp.target * frac - played(sp);
  const eligible = (sp: SP) => sp.line.pf < rules.foulOut;
  const late = ctx.period >= rules.periods && ctx.clock <= 300;
  const garbage = ctx.period >= rules.periods && ctx.clock <= 420 && Math.abs(ctx.margin) >= 22;
  const bench = () => s.roster.filter((sp) => !s.court.includes(sp) && eligible(sp));

  if (late && !garbage && Math.abs(ctx.margin) <= 12) {
    // Closing lineup: top-5 of rotation when fresh enough.
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

export function tickEnergy(s: Side, sec: number) {
  for (const sp of s.roster) {
    if (s.court.includes(sp)) {
      sp.sec += sec;
      sp.energy = Math.max(0.05, sp.energy - sec * K.drain * (1.6 - a(sp).stamina / 100));
    } else sp.energy = Math.min(1, sp.energy + sec * K.recover);
  }
}

// ---------- possession ----------

export interface PossOut { keep: boolean; transition: boolean; event: string }

function score(off: Side, def: Side, sp: SP, pts: number) {
  sp.line.pts += pts;
  off.pts += pts;
  off.court.forEach((x) => (x.line.pm += pts));
  def.court.forEach((x) => (x.line.pm -= pts));
}

function freeThrows(off: Side, def: Side, sp: SP, n: number, rng: Rng): boolean {
  const pFt = Math.min(0.95, Math.max(0.4, 0.785 + (a(sp).freeThrow - 62) * 0.0055));
  let lastMade = true;
  for (let i = 0; i < n; i++) {
    sp.line.fta++;
    lastMade = rng() < pFt;
    if (lastMade) { sp.line.ftm++; score(off, def, sp, 1); }
  }
  return lastMade;
}

function rebound(off: Side, def: Side, rng: Rng): boolean {
  const crash = (off.team.tactics.crashGlass - 50) * 0.0012;
  const pOrb = K.orb + (avg(off.court, (x) => a(x).offRebound) - avg(def.court, (x) => a(x).defRebound)) * 0.004 + crash;
  if (rng() < pOrb) {
    pick(off.court, (x) => a(x).offRebound ** 2 * (posRank(x) + 2), rng).line.orb++;
    return true;
  }
  if (rng() > 0.11) pick(def.court, (x) => a(x).defRebound ** 2 * (posRank(x) + 2), rng).line.drb++; // else team rebound
  return false;
}

/** Team-level shot quality: creation by the handler vs opponent help defense. */
export function contextEdge(handler: SP, def: SP[]): number {
  const create = (a(handler).passing + a(handler).vision + a(handler).offIQ) / 3 - 62;
  const help = avg(def, (x) => (a(x).helpD + a(x).perimeterD + a(x).interiorD) / 3) - 62;
  return create * K.create - help * K.help;
}

export function shotProb(sp: SP, defender: SP, protector: SP, type: ShotType, homeEdge: number): number {
  const skill = type === 'rim' ? (a(sp).layup + a(sp).closeShot + a(sp).dunk) / 3 : type === 'mid' ? a(sp).midRange : a(sp).threePoint;
  const d = type === 'rim' ? (a(protector).interiorD + a(defender).interiorD) / 2 : a(defender).perimeterD;
  const p = K.base[type] + (skill - 62) * K.skill[type] - (d - 62) * K.def[type] + homeEdge;
  return Math.min(0.9, Math.max(0.12, p * fatigue(sp)));
}

export function possession(off: Side, def: Side, rng: Rng, rules: Rules): PossOut {
  const usage = (sp: SP) => sp.p.ratings.tend.usage ** K.usgExp * fatigue(sp);
  const handler = pick(off.court, (x) => usage(x) * (a(x).ballHandle + a(x).passing), rng);

  // Turnover
  const pTo = K.toBase * (1 + (62 - (a(handler).ballHandle + a(handler).passing) / 2) * 0.01) * (1 + (avg(def.court, (x) => a(x).steal) - 62) * 0.008);
  if (rng() < pTo) {
    const loser = pick(off.court, (x) => usage(x) * (130 - a(x).ballHandle), rng);
    loser.line.tov++;
    if (rng() < K.stealShare) {
      pick(def.court, (x) => a(x).steal ** 2, rng).line.stl++;
      return { keep: false, transition: true, event: 'steal' };
    }
    return { keep: false, transition: false, event: 'turnover' };
  }

  // Non-shooting foul
  if (rng() < K.nsFoul) {
    const fouler = pick(def.court, (x) => 100 - a(x).perimeterD / 2, rng);
    fouler.line.pf++;
    def.fouls++;
    if (def.fouls >= rules.bonusAt) {
      const lastMade = freeThrows(off, def, handler, 2, rng);
      if (!lastMade && rebound(off, def, rng)) return { keep: true, transition: false, event: 'ft-orb' };
      return { keep: false, transition: false, event: 'bonus-ft' };
    }
    return { keep: true, transition: false, event: 'foul' };
  }

  // Shot
  const shooter = pick(off.court, usage, rng);
  const t = shooter.p.ratings.tend;
  const threeP = Math.min(0.85, t.threeRate * K.threeMul * (1 + (off.team.tactics.threeFocus - 50) / 100));
  const r = rng();
  const type: ShotType = r < threeP ? 'three' : rng() < t.rimRate ? 'rim' : 'mid';
  const defender = def.court[off.court.indexOf(shooter)] ?? def.court[0];
  const protector = def.court.reduce((b, x) => (a(x).block + a(x).interiorD > a(b).block + a(b).interiorD ? x : b));
  const pts = type === 'three' ? 3 : 2;
  const pMake = shotProb(shooter, defender, protector, type, (off.home ? K.homeEdge : 0) + contextEdge(handler, def.court) + K.offIQ * (a(shooter).offIQ - 62));

  const pFoul = K.sfoul[type] * (0.55 + a(shooter).drawFoul / 110);
  if (rng() < pFoul) {
    const fouler = type === 'rim' && rng() < 0.5 ? protector : defender;
    fouler.line.pf++;
    def.fouls++;
    if (rng() < pMake * K.andOne) {
      shooter.line.fga++; shooter.line.fgm++;
      if (type === 'three') { shooter.line.tpa++; shooter.line.tpm++; }
      score(off, def, shooter, pts);
      assist(off, shooter, type, rng);
      freeThrows(off, def, shooter, 1, rng);
      return { keep: false, transition: false, event: 'and-one' };
    }
    const lastMade = freeThrows(off, def, shooter, pts, rng);
    if (!lastMade && rebound(off, def, rng)) return { keep: true, transition: false, event: 'ft-orb' };
    return { keep: false, transition: false, event: 'shooting-foul' };
  }

  shooter.line.fga++;
  if (type === 'three') shooter.line.tpa++;
  const pBlock = K.block[type] * (1 + (a(protector).block - 62) * 0.025);
  if (rng() < pBlock) {
    (type === 'rim' ? protector : defender).line.blk++;
  } else if (rng() < pMake) {
    shooter.line.fgm++;
    if (type === 'three') shooter.line.tpm++;
    score(off, def, shooter, pts);
    assist(off, shooter, type, rng);
    return { keep: false, transition: false, event: `make-${type}` };
  }
  const orb = rebound(off, def, rng);
  return { keep: orb, transition: !orb && rng() < 0.18, event: orb ? 'orb' : 'drb' };
}

function assist(off: Side, shooter: SP, type: ShotType, rng: Rng) {
  if (rng() >= K.assist[type]) return;
  const mates = off.court.filter((x) => x !== shooter);
  pick(mates, (x) => (a(x).passing * a(x).vision) ** 1.5 * x.p.ratings.tend.usage, rng).line.ast++;
}

// ---------- game ----------

export function possessionLength(off: Side, def: Side, prev: PossOut | null, rng: Rng): number {
  if (prev?.keep && prev.event !== 'foul') return 4 + rng() * 9;
  if (prev?.transition) return 4 + rng() * 7;
  const pace = (off.team.tactics.pace + def.team.tactics.pace) / 2;
  const mean = K.possSec * (1 - (pace - 50) / 250);
  return Math.min(24, Math.max(4, mean + gauss(rng) * 4.5));
}

export function simGame(home: TeamState, away: TeamState, players: Record<string, Player>, rng: Rng, rules: Rules = NBA_RULES): GameResult {
  const H = makeSide(home, players, true), A = makeSide(away, players, false);
  const periods: [number, number][] = [];
  const total = rules.periods * rules.periodSec;
  let elapsed = 0;
  let off = rng() < 0.5 ? H : A; // tip-off
  for (let period = 1; period <= rules.periods || H.pts === A.pts; period++) {
    const len = period <= rules.periods ? rules.periodSec : rules.otSec;
    let clock = len;
    const start: [number, number] = [H.pts, A.pts];
    H.fouls = A.fouls = 0;
    if (period > 1) for (const s of [H, A]) s.roster.forEach((sp) => (sp.energy = Math.min(1, sp.energy + (period === 3 ? 0.35 : 0.18))));
    if (period > 1) off = period % 2 === 0 ? (off === H ? A : H) : off;
    let prev: PossOut | null = null;
    while (clock > 0) {
      const def = off === H ? A : H;
      if (!prev || !prev.transition) {
        const ctx = { period, clock, margin: H.pts - A.pts };
        doSubs(H, elapsed, total, ctx, rules);
        doSubs(A, elapsed, total, { ...ctx, margin: -ctx.margin }, rules);
      }
      const dur = Math.min(clock, possessionLength(off, def, prev, rng));
      tickEnergy(H, dur); tickEnergy(A, dur);
      clock -= dur; elapsed += dur;
      prev = possession(off, def, rng, rules);
      if (!prev.keep) off = def;
    }
    periods.push([H.pts - start[0], A.pts - start[1]]);
  }
  const box = (s: Side) => s.roster.map((sp) => ({ ...sp.line, min: Math.round(sp.sec / 6) / 10, gp: sp.sec > 0 ? 1 : 0 }));
  return { home: H.pts, away: A.pts, periods, box: { home: box(H), away: box(A) } }; // caller strips box for non-user games
}
