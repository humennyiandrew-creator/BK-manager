// Player development: weekly in-season ticks driven by training, staff, facilities, minutes; annual offseason jump.
import type { GameState, Player, TrainingFocus, TrainingPlan } from './model';
import { ageOf, type Attr } from './ratings';
import { gauss, hashString, mulberry32, type Rng } from './rng';
import { staffRating } from './mgmt/staff';
import { facilityLevel, hasNode } from './mgmt/facilities';
import { daysBetween } from './schedule';
import { filmSessionsThisWeek, scheduleGrowthMul, scheduleInjuryMul } from './training';
import { arcActive, settleArc, tickArc } from './arcs';
import { standings } from './season';
import { clamp } from './mgmt/market';

export const FOCUS_ATTRS: Record<TrainingFocus, Attr[]> = {
  balanced: [],
  shooting: ['threePoint', 'midRange', 'freeThrow'],
  finishing: ['layup', 'dunk', 'closeShot', 'postScoring', 'drawFoul'],
  playmaking: ['ballHandle', 'passing', 'vision', 'offIQ'],
  defense: ['perimeterD', 'interiorD', 'helpD', 'steal', 'block'],
  rebounding: ['offRebound', 'defRebound', 'strength', 'vertical'],
  conditioning: ['stamina', 'speed', 'acceleration', 'durability'],
};
const SKILL_ATTRS: Attr[] = ['closeShot', 'layup', 'postScoring', 'midRange', 'threePoint', 'freeThrow', 'ballHandle', 'passing', 'vision', 'offIQ', 'perimeterD', 'interiorD', 'helpD', 'steal', 'block', 'offRebound', 'defRebound'];
const PHYSICAL: Attr[] = ['speed', 'acceleration', 'vertical', 'stamina'];

export const defaultTraining = (): TrainingPlan => ({ intensity: 3, focus: 'balanced', individual: {} });

export function trainingEffects(s: GameState, teamId: string): { growthMul: number; injuryMul: number; fatigueMul: number } {
  const plan = s.training[teamId] ?? defaultTraining();
  const i = plan.intensity - 1; // 0–4
  const dev = 0.85 + staffRating(s, teamId, 'development') / 333;
  const fac = 0.9 + facilityLevel(s, teamId, 'training') * 0.04;
  const med = (1.1 - staffRating(s, teamId, 'medical') / 250) * (1.08 - facilityLevel(s, teamId, 'medical') * 0.03) * (hasNode(s, teamId, 'medical_sportsScience') ? 0.9 : 1);
  return {
    growthMul: (0.7 + 0.15 * i) * dev * fac,
    injuryMul: (0.8 + 0.1 * i) * med * scheduleInjuryMul(s, teamId),
    fatigueMul: 0.9 + 0.05 * i,
  };
}

/** Fatigue >70 slows growth and raises injury risk. */
export function fatigueGrowthMul(p: Player): number {
  const f = p.fatigue ?? 0;
  return f > 70 ? Math.max(0.4, 1 - (f - 70) * 0.02) : 1;
}
export function fatigueInjuryMul(p: Player): number {
  const f = p.fatigue ?? 0;
  return f > 70 ? 1 + (f - 70) * 0.02 : 1;
}

/** Expected OVR change over a full year at this age. */
export function annualExpected(age: number, ovr: number, pot: number): number {
  const gap = Math.max(0, pot - ovr);
  if (age <= 22) return 0.26 * gap + 0.6;
  if (age <= 24) return 0.18 * gap + 0.3;
  if (age <= 27) return 0.15 * gap;
  if (age <= 29) return -0.3;
  if (age <= 31) return -1.2;
  if (age <= 33) return -2.2;
  return -3.5;
}

function shiftAttrs(s: GameState, p: Player, delta: number, focus: TrainingFocus, rng: Rng) {
  const a = p.ratings.attrs;
  const pool = FOCUS_ATTRS[focus].length ? FOCUS_ATTRS[focus] : SKILL_ATTRS;
  const age = ageOf(p.birthDate);
  const shootingLab = focus === 'shooting' && p.teamId && hasNode(s, p.teamId, 'training_shootingLab') ? 1.15 : 1;
  const weightRoom = (focus === 'conditioning' || focus === 'rebounding') && p.teamId && hasNode(s, p.teamId, 'training_weightRoom') ? 1.15 : 1;
  const perfCenter = p.teamId && hasNode(s, p.teamId, 'training_perfCenter') ? 1.1 : 1;
  const nodeMul = shootingLab * weightRoom * perfCenter;
  // Focused attrs move ~2x, a few random skill attrs move 1x; physicals decline with age.
  for (const k of pool) a[k] = Math.max(25, Math.min(99, a[k] + Math.sign(delta) * Math.round(Math.abs(delta) * (focus === 'balanced' ? 1 : 2) * (0.5 + rng()) * nodeMul)));
  if (focus !== 'balanced') for (let i = 0; i < 3; i++) {
    const k = SKILL_ATTRS[Math.floor(rng() * SKILL_ATTRS.length)];
    a[k] = Math.max(25, Math.min(99, a[k] + Math.sign(delta)));
  }
  if (delta < 0 && age > 29) for (const k of PHYSICAL) a[k] = Math.max(25, a[k] - Math.round(rng() * 1.5));
}

function applyDelta(s: GameState, p: Player, raw: number, focus: TrainingFocus, rng: Rng) {
  p.prog = (p.prog ?? 0) + raw;
  const whole = Math.trunc(p.prog);
  if (!whole) return;
  p.prog -= whole;
  // Elite ceiling: above 90, only every other point of positive progress sticks.
  const gain = whole > 0 && p.ratings.ovr >= 90 ? Math.floor(whole / 2) : whole;
  p.ratings.ovr = Math.max(35, Math.min(99, p.ratings.ovr + gain));
  if (p.ratings.ovr > p.ratings.pot) p.ratings.pot = p.ratings.ovr;
  p.lastChange = whole;
  shiftAttrs(s, p, whole, focus, rng);
  // Individual development plan: 50% chance of +1 extra on the target attribute on a positive tick.
  if (whole > 0 && p.devPlan && rng() < 0.5) {
    const a = p.ratings.attrs;
    a[p.devPlan] = Math.max(25, Math.min(99, a[p.devPlan] + 1));
  }
}

const IN_SEASON_SHARE = 0.35;
const WEEKS = 26;

// ---------- dynamic potential: performance vs expectation ----------

/** Hollinger game score per 36 minutes. */
function gmsc36(p: Player): number {
  const l = p.season;
  const g = l.pts + 0.4 * l.fgm - 0.7 * l.fga - 0.4 * (l.fta - l.ftm) + 0.7 * l.orb + 0.3 * l.drb + l.stl + 0.7 * l.ast + 0.7 * l.blk - 0.4 * l.pf - l.tov;
  return (g / Math.max(1, l.min)) * 36;
}

/**
 * Form = how far a player's production sits above/below what his OVR predicts (league regression, in SDs).
 * Sample-size shrink: needs ~400 minutes before form counts fully.
 */
export function updateForm(s: GameState) {
  const all = Object.values(s.players).filter((p) => p.teamId && p.season.min >= 150);
  // Separate regressions for bigs and perimeter players: box-score value differs by role.
  const isBig = (p: Player) => p.positions[0] === 'C' || p.positions[0] === 'PF';
  for (const pool of [all.filter(isBig), all.filter((p) => !isBig(p))]) {
    if (pool.length < 25) continue;
    const xs = pool.map((p) => p.ratings.ovr), ys = pool.map(gmsc36);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
    // Quadratic-ish: stars' production grows faster than linearly with OVR, so allow a steeper slope above mean.
    const slope = sxy / Math.max(1, sxx);
    const pred = (x: number) => my + slope * (x - mx) + Math.max(0, x - 85) ** 2 * slope * 0.08;
    const resid = pool.map((p, i) => ys[i] - pred(xs[i]));
    const sd = Math.sqrt(resid.reduce((a, r) => a + r * r, 0) / resid.length) || 1;
    pool.forEach((p, i) => {
      const w = p.season.min / (p.season.min + 400);
      p.form = Math.max(-3, Math.min(3, +((resid[i] / sd) * w).toFixed(2)));
    });
  }
}

/** Weekly (every 7th day from Oct 1) development tick for every rostered player. */
export function progressionDaily(s: GameState) {
  if (s.phase === 'offseason') return;
  const d = daysBetween(`${s.seasonYear}-10-01`, s.date);
  if (d <= 0 || d % 7 !== 0) return;
  updateForm(s);
  const week = d / 7;
  const rng = mulberry32(hashString(`${s.seed}|prog|${s.date}`));
  const eff = new Map<string, ReturnType<typeof trainingEffects>>();
  // Team record feeds morale: winning rooms are happier rooms.
  const record = new Map<string, { gp: number; pct: number }>();
  for (const comp of new Set(Object.values(s.teams).map((t) => t.league ?? 'NBA'))) {
    for (const r of standings(s, undefined, comp)) record.set(r.teamId, { gp: r.w + r.l, pct: r.pct });
  }
  for (const p of Object.values(s.players)) {
    if (!p.teamId || p.retired) continue;
    if (!eff.has(p.teamId)) eff.set(p.teamId, trainingEffects(s, p.teamId));
    const e = eff.get(p.teamId)!;
    const plan = s.training[p.teamId] ?? defaultTraining();
    const age = ageOf(p.birthDate, new Date(s.date));
    const mpg = p.season.gp ? p.season.min / p.season.gp : 0;
    const minutesMul = age <= 25 ? 0.85 + Math.min(1, mpg / 30) * 0.3 : 1;
    const work = 0.85 + p.ratings.personality.workEthic / 66;
    const base = annualExpected(age, p.ratings.ovr, p.ratings.pot) * IN_SEASON_SHARE / WEEKS;
    const schedMul = scheduleGrowthMul(s, p.teamId) * fatigueGrowthMul(p);
    let growth = base > 0 ? base * e.growthMul * schedMul * minutesMul * work : base / Math.max(0.8, e.growthMul * 0.5 + 0.5);
    // A breakout season pauses age decline; a collapse pauses normal growth — the arc is the story.
    if (arcActive(p, s.season, week)) growth = p.arc!.kind === 'breakout' ? Math.max(0, growth) : Math.min(0, growth);
    // Performance feeds back: overperformers grow a little faster and raise their ceiling, flops the reverse.
    const form = p.form ?? 0;
    const programBonus = p.program ? 0.15 : 0; // active development programme: small extra weekly growth
    applyDelta(s, p, growth + form * 0.035 + gauss(rng) * 0.12 + programBonus, plan.individual[p.id] ?? plan.focus, rng);
    const arcStep = tickArc(s, p, week);
    if (arcStep) p.lastChange = arcStep;
    (p.ovrTrack ??= []).push(p.ratings.ovr);
    if (p.ovrTrack.length > 40) p.ovrTrack.shift();
    const filmN = filmSessionsThisWeek(s, p.teamId);
    if (filmN > 0) {
      const bump = filmN * 0.15;
      p.ratings.attrs.offIQ = Math.min(99, p.ratings.attrs.offIQ + bump);
      p.ratings.attrs.helpD = Math.min(99, p.ratings.attrs.helpD + bump);
    }
    const potStep = form * (age <= 25 ? 0.12 : 0.05);
    const room = 6 - Math.abs(p.potSeason ?? 0); // max ±6 POT per season from form
    if (Math.abs(potStep) > 0.01 && room > 0) {
      const ceiling = age >= 27 ? p.ratings.ovr + 2 : 99; // veterans: potential ≈ current level
      const next = Math.max(p.ratings.ovr, Math.min(ceiling, 99, p.ratings.pot + Math.sign(potStep) * Math.min(Math.abs(potStep), room)));
      p.potSeason = (p.potSeason ?? 0) + (next - p.ratings.pot);
      p.ratings.pot = +next.toFixed(2);
    }
    // Morale: playing time vs role expectation, winning, heavy training grind.
    // Stars expect ~35 mpg, rotation players ~20, the end of the bench a few minutes; no games yet = no complaint.
    const rec = record.get(p.teamId);
    const expectMin = 8 + clamp((p.ratings.ovr - 62) * 1.05, 0, 28);
    const minutesTerm = rec?.gp ? clamp((mpg - expectMin) * 1.5, -25, 20) : 0;
    const winTerm = rec?.gp ? (rec.pct - 0.5) * 16 * Math.min(1, rec.gp / 10) : 0;
    const target = 62 + minutesTerm + winTerm - (e.fatigueMul - 1) * 40;
    p.morale = Math.round(Math.max(0, Math.min(100, p.morale + (target - p.morale) * 0.15)));
  }
}

/** Offseason development jump (called once per offseason). */
export function annualProgression(s: GameState) {
  const rng = mulberry32(hashString(`${s.seed}|annual|${s.season}`));
  for (const p of Object.values(s.players)) {
    if (p.retired) continue;
    p.ovrHistory = [...(p.ovrHistory ?? []), { season: s.season, ovr: p.ratings.ovr, pot: p.ratings.pot }].slice(-6);
    settleArc(s, p);
    const age = ageOf(p.birthDate, new Date(`${s.seasonYear + 1}-07-01`));
    const e = p.teamId ? trainingEffects(s, p.teamId) : { growthMul: 0.85 };
    const base = annualExpected(age, p.ratings.ovr, p.ratings.pot) * (1 - IN_SEASON_SHARE);
    const plan = p.teamId ? s.training[p.teamId] ?? defaultTraining() : defaultTraining();
    const work = 0.85 + p.ratings.personality.workEthic / 66;
    const delta = (base > 0 ? base * e.growthMul * work : base) + gauss(rng) * 1.5;
    applyDelta(s, p, delta, plan.individual[p.id] ?? plan.focus, rng);
    // Potential drifts: young players' ceilings move, vets' pot converges to ovr.
    if (age <= 24) p.ratings.pot = Math.max(p.ratings.ovr, Math.min(99, Math.round(p.ratings.pot + gauss(rng) * 2)));
    else p.ratings.pot = Math.max(p.ratings.ovr, Math.round(p.ratings.pot - (p.ratings.pot - p.ratings.ovr) * 0.5));
    p.potSeason = 0;
    p.form = 0;
  }
}
