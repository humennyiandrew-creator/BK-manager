// Player development: weekly in-season ticks driven by training, staff, facilities, minutes; annual offseason jump.
import type { GameState, Player, TrainingFocus, TrainingPlan } from './model';
import { ageOf, type Attr } from './ratings';
import { gauss, hashString, mulberry32, type Rng } from './rng';
import { staffRating } from './mgmt/staff';
import { facilityLevel } from './mgmt/facilities';
import { daysBetween } from './schedule';

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
  const med = (1.1 - staffRating(s, teamId, 'medical') / 250) * (1.08 - facilityLevel(s, teamId, 'medical') * 0.03);
  return {
    growthMul: (0.7 + 0.15 * i) * dev * fac,
    injuryMul: (0.8 + 0.1 * i) * med,
    fatigueMul: 0.9 + 0.05 * i,
  };
}

/** Expected OVR change over a full year at this age. */
export function annualExpected(age: number, ovr: number, pot: number): number {
  const gap = Math.max(0, pot - ovr);
  if (age <= 22) return 0.35 * gap + 1;
  if (age <= 24) return 0.25 * gap + 0.5;
  if (age <= 27) return 0.15 * gap;
  if (age <= 29) return -0.3;
  if (age <= 31) return -1.2;
  if (age <= 33) return -2.2;
  return -3.5;
}

function shiftAttrs(p: Player, delta: number, focus: TrainingFocus, rng: Rng) {
  const a = p.ratings.attrs;
  const pool = FOCUS_ATTRS[focus].length ? FOCUS_ATTRS[focus] : SKILL_ATTRS;
  const age = ageOf(p.birthDate);
  // Focused attrs move ~2x, a few random skill attrs move 1x; physicals decline with age.
  for (const k of pool) a[k] = Math.max(25, Math.min(99, a[k] + Math.sign(delta) * Math.round(Math.abs(delta) * (focus === 'balanced' ? 1 : 2) * (0.5 + rng()))));
  if (focus !== 'balanced') for (let i = 0; i < 3; i++) {
    const k = SKILL_ATTRS[Math.floor(rng() * SKILL_ATTRS.length)];
    a[k] = Math.max(25, Math.min(99, a[k] + Math.sign(delta)));
  }
  if (delta < 0 && age > 29) for (const k of PHYSICAL) a[k] = Math.max(25, a[k] - Math.round(rng() * 1.5));
}

function applyDelta(p: Player, raw: number, focus: TrainingFocus, rng: Rng) {
  p.prog = (p.prog ?? 0) + raw;
  const whole = Math.trunc(p.prog);
  if (!whole) return;
  p.prog -= whole;
  p.ratings.ovr = Math.max(35, Math.min(99, p.ratings.ovr + whole));
  if (p.ratings.ovr > p.ratings.pot) p.ratings.pot = p.ratings.ovr;
  p.lastChange = whole;
  shiftAttrs(p, whole, focus, rng);
}

const IN_SEASON_SHARE = 0.35;
const WEEKS = 26;

/** Weekly (every 7th day from Oct 1) development tick for every rostered player. */
export function progressionDaily(s: GameState) {
  if (s.phase === 'offseason') return;
  const d = daysBetween(`${s.seasonYear}-10-01`, s.date);
  if (d <= 0 || d % 7 !== 0) return;
  const rng = mulberry32(hashString(`${s.seed}|prog|${s.date}`));
  const eff = new Map<string, ReturnType<typeof trainingEffects>>();
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
    const growth = base > 0 ? base * e.growthMul * minutesMul * work : base / Math.max(0.8, e.growthMul * 0.5 + 0.5);
    applyDelta(p, growth + gauss(rng) * 0.12, plan.individual[p.id] ?? plan.focus, rng);
    // Morale: playing time vs role expectation, winning, heavy training grind.
    const expectMin = 12 + Math.max(0, p.ratings.ovr - 65) * 1.3;
    const target = 60 + Math.max(-25, Math.min(20, (mpg - expectMin) * 1.5)) - (e.fatigueMul - 1) * 40;
    p.morale = Math.round(Math.max(0, Math.min(100, p.morale + (target - p.morale) * 0.15)));
  }
}

/** Offseason development jump (called once per offseason). */
export function annualProgression(s: GameState) {
  const rng = mulberry32(hashString(`${s.seed}|annual|${s.season}`));
  for (const p of Object.values(s.players)) {
    if (p.retired) continue;
    p.ovrHistory = [...(p.ovrHistory ?? []), { season: s.season, ovr: p.ratings.ovr, pot: p.ratings.pot }].slice(-6);
    const age = ageOf(p.birthDate, new Date(`${s.seasonYear + 1}-07-01`));
    const e = p.teamId ? trainingEffects(s, p.teamId) : { growthMul: 0.85 };
    const base = annualExpected(age, p.ratings.ovr, p.ratings.pot) * (1 - IN_SEASON_SHARE);
    const plan = p.teamId ? s.training[p.teamId] ?? defaultTraining() : defaultTraining();
    const work = 0.85 + p.ratings.personality.workEthic / 66;
    const delta = (base > 0 ? base * e.growthMul * work : base) + gauss(rng) * 1.5;
    applyDelta(p, delta, plan.individual[p.id] ?? plan.focus, rng);
    // Potential drifts: young players' ceilings move, vets' pot converges to ovr.
    if (age <= 24) p.ratings.pot = Math.max(p.ratings.ovr, Math.min(99, Math.round(p.ratings.pot + gauss(rng) * 2)));
    else p.ratings.pot = Math.max(p.ratings.ovr, Math.round(p.ratings.pot - (p.ratings.pot - p.ratings.ovr) * 0.5));
  }
}
