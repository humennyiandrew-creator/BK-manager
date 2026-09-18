// Tactic fit: how well a lineup's personnel suits the chosen offense, sliders and defensive scheme.
// Every effect is centred on league-average personnel (attr 62), so a neutral team gets ~0 and
// no tactic is free: each one pays off only with the right players and costs something elsewhere.
import type { Player, Tactics } from '../model';
import type { DefScheme, OffSystem } from './types';

export interface Profile {
  spacing: number;     // avg 3PT of the five, weighted toward the best shooters
  rim: number;         // top-3 rim finishing (layup/dunk/closeShot + speed)
  post: number;        // best post scorer
  handling: number;    // best handler + avg passing
  glass: number;       // avg rebounding + strength
  size: number;        // avg height (cm)
  speed: number;       // avg speed/acceleration
  rimProt: number;     // best block + interiorD
  perimD: number;      // avg perimeterD
  minPerimD: number;   // weakest perimeter defender (switch target)
  bigMobility: number; // speed of the two biggest players
  iq: number;          // avg offIQ + helpD
}

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const top = (xs: number[], n: number) => avg([...xs].sort((a, b) => b - a).slice(0, n));

export function lineupProfile(five: Player[]): Profile {
  const a = five.map((p) => p.ratings.attrs);
  const bigs = [...five].sort((x, y) => y.heightCm - x.heightCm).slice(0, 2).map((p) => p.ratings.attrs);
  return {
    spacing: top(a.map((x) => x.threePoint), 4) * 0.7 + avg(a.map((x) => x.threePoint)) * 0.3,
    rim: top(a.map((x) => (x.layup + x.dunk + x.closeShot) / 3 * 0.75 + x.speed * 0.25), 3),
    post: Math.max(...a.map((x) => x.postScoring)),
    handling: Math.max(...a.map((x) => x.ballHandle)) * 0.5 + avg(a.map((x) => x.passing)) * 0.5,
    glass: avg(a.map((x) => (x.offRebound + x.defRebound) / 2 * 0.7 + x.strength * 0.3)),
    size: avg(five.map((p) => p.heightCm)),
    speed: avg(a.map((x) => (x.speed + x.acceleration) / 2)),
    rimProt: Math.max(...a.map((x) => (x.block + x.interiorD) / 2)),
    perimD: avg(a.map((x) => x.perimeterD)),
    minPerimD: Math.min(...a.map((x) => x.perimeterD)),
    bigMobility: avg(bigs.map((x) => (x.speed + x.acceleration) / 2)),
    iq: avg(a.map((x) => (x.offIQ + x.helpD) / 2)),
  };
}

/** Rotation-weighted profile for UI and AI planning: top 8 by target minutes. */
export function teamProfile(players: Player[], minutes: Record<string, number>): Profile {
  const rot = [...players].filter((p) => !p.injury).sort((x, y) => (minutes[y.id] ?? 0) - (minutes[x.id] ?? 0)).slice(0, 8);
  const starters = lineupProfile(rot.slice(0, 5));
  const bench = rot.length >= 8 ? lineupProfile(rot.slice(3, 8)) : starters;
  const out = {} as Profile;
  for (const k of Object.keys(starters) as (keyof Profile)[]) out[k] = starters[k] * 0.7 + bench[k] * 0.3;
  return out;
}

// ---------- offense ----------

/** How much each offensive system leans on each skill (z-units per 10 attr points above 62). */
const SYSTEM_NEEDS: Record<OffSystem, Partial<Record<keyof Profile, number>>> = {
  motion:    { iq: 0.5, handling: 0.3, spacing: 0.4 },
  pnr:       { handling: 0.6, rim: 0.3, spacing: 0.3 },
  princeton: { iq: 0.7, handling: 0.3, post: 0.2 },
  triangle:  { post: 0.5, iq: 0.4, handling: 0.2 },
  post:      { post: 0.7, glass: 0.3, spacing: 0.2 },
  seven:     { speed: 0.5, spacing: 0.5, handling: 0.2 },
  iso:       { handling: 0.5, rim: 0.4, spacing: 0.3 },
};

export interface OffFit {
  edge: number;          // added to make probability, all shots
  rimEdge: number;       // extra on rim shots (spacing opens / clogs the paint)
  threeEdge: number;     // extra on threes (forced threes by non-shooters)
  toMul: number;         // turnover multiplier
  orbAdd: number;        // own offensive-rebound chance
  oppTransition: number; // opponent's extra transition chance after our misses
  drainMul: number;      // fatigue from tempo
  score: number;         // −100..100 for UI
  notes: string[];
}

// League team-profile mean/SD (2026-27 rosters): fit is judged relative to the typical NBA rotation.
const NORM: Record<keyof Profile, [number, number]> = {
  spacing: [64.4, 3.7], rim: [68.1, 2.5], post: [79.4, 4], handling: [70.5, 4], glass: [67.8, 3.2], size: [202.8, 2.3],
  speed: [56.4, 4.1], rimProt: [85.3, 7], perimD: [64.1, 4.5], minPerimD: [53.7, 4.5], bigMobility: [49.7, 5], iq: [68.1, 3.2],
};
/** Standardised skill: 0 = league-typical, ±0.5 = one team-SD. */
const zn = (p: Profile, k: keyof Profile) => ((p[k] - NORM[k][0]) / NORM[k][1]) * 0.5;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function offenseFit(p: Profile, t: Tactics): OffFit {
  const notes: string[] = [];
  const needs = SYSTEM_NEEDS[t.offense];
  let sys = 0, wsum = 0;
  for (const [k, w] of Object.entries(needs) as [keyof Profile, number][]) { sys += zn(p, k) * w; wsum += w; }
  sys /= wsum; // ~ −1..+1.5 for real rosters

  // Shot profile slider: 0 = attack the paint, 100 = bomb from deep.
  const out = (t.threeFocus - 50) / 50;        // −1..+1
  const shooting = zn(p, 'spacing');
  const inside = (zn(p, 'rim') + zn(p, 'post') * 0.5 + zn(p, 'glass') * 0.5) / 2;
  // Leaning into what the five do well pays; leaning away from it costs.
  const profileFit = out > 0 ? out * (shooting - inside * 0.5) : -out * (inside - shooting * 0.5);
  if (out > 0.3 && shooting < -0.4) notes.push('Perimeter focus with poor shooters: forced, contested threes');
  if (out < -0.3 && inside > 0.4) notes.push('Paint focus suits this size and finishing');
  if (out > 0.3 && shooting > 0.4) notes.push('Shooters thrive with a perimeter focus');
  if (out < -0.3 && shooting > 0.5 && inside < 0) notes.push('Paint focus wastes your shooters');

  // Spacing always matters for rim attempts; paint focus magnifies it (clogged lane).
  const rimEdge = clamp(shooting * 0.012 * (1 + Math.max(0, -out) * 0.6), -0.03, 0.02) + clamp(-out * inside * 0.01, -0.012, 0.018);
  const threeEdge = out > 0 ? clamp(shooting * 0.01 * out, -0.03, 0.012) : 0;
  if (shooting < -0.6) notes.push('Poor spacing: defenders pack the paint');

  // Glass: crashing helps big lineups, but leaves the floor open for opponent fast breaks.
  const crash = (t.crashGlass - 50) / 50;
  const orbAdd = crash * (0.02 + clamp(zn(p, 'glass'), -1, 1.5) * 0.02);
  const oppTransition = Math.max(0, crash) * 0.1;
  if (crash > 0.3 && zn(p, 'glass') > 0.5) notes.push('Big, strong lineup: crashing the glass pays off');
  if (crash > 0.3 && zn(p, 'glass') < -0.3) notes.push('Crashing with a small lineup gives up transition for little');

  // Tempo: fast pace needs speed and handling, else turnovers; always costs legs.
  const pace = (t.pace - 50) / 50;
  const tempoFit = pace * (zn(p, 'speed') * 0.6 + zn(p, 'handling') * 0.4);
  const toMul = clamp(1 - sys * 0.04 - (pace > 0 ? tempoFit * 0.05 : 0) + Math.max(0, pace) * 0.04, 0.88, 1.14);
  const drainMul = 1 + pace * 0.08;
  if (pace > 0.3 && zn(p, 'speed') < -0.3) notes.push('Slow roster at high pace: sloppy turnovers and tired legs');

  const edge = clamp(sys * 0.009 + profileFit * 0.008 + (pace > 0 ? tempoFit * 0.004 : 0), -0.025, 0.025);
  if (sys > 0.6) notes.push(`Personnel fits the ${t.offense} system`);
  if (sys < -0.4) notes.push(`Roster lacks what the ${t.offense} system needs`);
  const score = Math.round(clamp((edge + rimEdge * 0.4 + threeEdge * 0.3) / 0.03, -1, 1) * 100);
  return { edge, rimEdge, threeEdge, toMul, orbAdd, oppTransition, drainMul, score, notes };
}

// ---------- defense ----------

export interface DefFit {
  mul: number;           // multiplier on the scheme's own rim/mid/three/TO effects (how well we execute it)
  leak: number;          // extra make-prob given up when personnel can't run the scheme
  score: number;
  notes: string[];
}

export function defenseFit(p: Profile, scheme: DefScheme, opp?: Profile): DefFit {
  const notes: string[] = [];
  let q = 0;
  switch (scheme) {
    case 'drop': q = zn(p, 'rimProt') * 0.8 - Math.max(0, (opp ? zn(opp, 'spacing') : 0)) * 0.3; if (zn(p, 'rimProt') < 0) notes.push('Drop without a rim protector'); break;
    case 'switch': q = zn(p, 'minPerimD') * 0.7 + zn(p, 'bigMobility') * 0.3; if (zn(p, 'minPerimD') < -0.5) notes.push('Weak link gets hunted on switches'); break;
    case 'hedge': q = zn(p, 'bigMobility') * 0.6 + zn(p, 'iq') * 0.4; break;
    case 'blitz': q = zn(p, 'bigMobility') * 0.4 + zn(p, 'speed') * 0.3 + zn(p, 'iq') * 0.3; if (zn(p, 'speed') < -0.3) notes.push('Slow rotations behind the blitz'); break;
    case 'zone23': q = zn(p, 'size') * 0.4 + zn(p, 'rimProt') * 0.4 - Math.max(0, (opp ? zn(opp, 'spacing') : 0)) * 0.5; break;
    case 'zone32': q = zn(p, 'size') * 0.3 + zn(p, 'perimD') * 0.4 - Math.max(0, (opp ? zn(opp, 'post') : 0)) * 0.3; break;
    case 'box1': q = zn(p, 'perimD') * 0.5 + zn(p, 'rimProt') * 0.3; break;
    case 'press': q = zn(p, 'speed') * 0.6 + zn(p, 'perimD') * 0.4; if (zn(p, 'speed') < 0) notes.push('Press with a slow roster gets broken for layups'); break;
    default: q = zn(p, 'perimD') * 0.5 + zn(p, 'iq') * 0.5;
  }
  q = clamp(q, -1.5, 1.5);
  if (q > 0.6) notes.push('Personnel suits this scheme');
  return { mul: clamp(1 + q * 0.5, 0.3, 1.6), leak: q < 0 ? -q * 0.012 : 0, score: Math.round(clamp(q / 1.2, -1, 1) * 100), notes };
}

/** Best-fit tactics for a profile (AI coaches; UI "suggest" button). */
export function suggestTactics(p: Profile, base: Tactics): Partial<Tactics> {
  const systems: OffSystem[] = ['motion', 'pnr', 'princeton', 'triangle', 'post', 'seven', 'iso'];
  const offense = systems.reduce((b, sys) => (offenseFit(p, { ...base, offense: sys, threeFocus: 50, crashGlass: 50, pace: 50 }).edge > offenseFit(p, { ...base, offense: b, threeFocus: 50, crashGlass: 50, pace: 50 }).edge ? sys : b), 'motion' as OffSystem);
  const inside = (zn(p, 'rim') + zn(p, 'post') * 0.5 + zn(p, 'glass') * 0.5) / 2;
  const schemes: DefScheme[] = ['man', 'switch', 'drop', 'hedge', 'blitz'];
  const defense = schemes.reduce((b, sc) => (defenseFit(p, sc).score > defenseFit(p, b).score + 10 ? sc : b), 'man' as DefScheme);
  return {
    offense, defense,
    threeFocus: Math.round(50 + clamp((zn(p, 'spacing') - inside) * 40, -30, 30)),
    crashGlass: Math.round(50 + clamp(zn(p, 'glass') * 40, -25, 25)),
    pace: Math.round(50 + clamp((zn(p, 'speed') * 0.6 + zn(p, 'handling') * 0.4) * 30, -15, 15)),
  };
}
