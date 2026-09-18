// Stats → ratings. Two passes: build league pool distribution, then z-score each player.
import type { Position, RawPlayer } from './types';
import { gauss, hashString, mulberry32, type Rng } from './rng';

export const ATTRS = [
  // scoring
  'closeShot', 'layup', 'dunk', 'postScoring', 'midRange', 'threePoint', 'freeThrow', 'drawFoul',
  // playmaking
  'ballHandle', 'passing', 'vision', 'offIQ',
  // defense
  'perimeterD', 'interiorD', 'helpD', 'steal', 'block',
  // rebounding
  'offRebound', 'defRebound',
  // physical
  'speed', 'acceleration', 'strength', 'vertical', 'stamina', 'durability',
  // mental
  'clutch',
] as const;
export type Attr = (typeof ATTRS)[number];
export type Attributes = Record<Attr, number>;

export interface Tendencies {
  usage: number;      // share of team possessions used, ~0.10–0.36
  threeRate: number;  // 3PA / FGA
  rimRate: number;    // share of 2PA at rim (rest = mid/post)
  ftRate: number;     // FTA / FGA
  passRate: number;   // how often he gives the ball up on a decision node, 0–1
}

export interface Personality {
  ego: number; workEthic: number; loyalty: number; temperament: number; // 1–20
}

export interface PlayerRatings {
  attrs: Attributes;
  ovr: number;
  pot: number;
  tend: Tendencies;
  personality: Personality;
  injuryProne: number; // 0–1
}

// ---------- aggregation ----------

const SEASON_W = [3, 2, 1];
const SHRINK_MIN = 500; // minutes of league-average prior mixed into per-minute rates

interface Agg {
  min: number; gp: number; games: number;
  pts: number; orb: number; drb: number; ast: number; stl: number; blk: number; tov: number; pf: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
  usg: number; bpm: number; obpm: number; dbpm: number; per: number; advMin: number;
}

function aggregate(p: RawPlayer): Agg {
  const a: Agg = { min: 0, gp: 0, games: 0, pts: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
    fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, usg: 0, bpm: 0, obpm: 0, dbpm: 0, per: 0, advMin: 0 };
  p.stats.slice(0, 3).forEach((s, i) => {
    const w = SEASON_W[i];
    for (const k of ['min', 'pts', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta'] as const) {
      a[k] += s[k] * w;
    }
    a.gp += s.gp * w;
    a.games += 82 * w;
    if (s.bpm != null && s.min > 0) {
      const m = s.min * w;
      a.usg += (s.usg ?? 20) * m; a.bpm += s.bpm * m; a.obpm += (s.obpm ?? 0) * m;
      a.dbpm += (s.dbpm ?? 0) * m; a.per += (s.per ?? 15) * m; a.advMin += m;
    }
  });
  if (a.advMin > 0) { a.usg /= a.advMin; a.bpm /= a.advMin; a.obpm /= a.advMin; a.dbpm /= a.advMin; a.per /= a.advMin; }
  else { a.usg = 17; a.bpm = -2; a.obpm = -1; a.dbpm = -1; a.per = 12; }
  return a;
}

// ---------- metrics ----------

type MetricKey =
  | 'pts36' | 'orb36' | 'drb36' | 'ast36' | 'stl36' | 'blk36' | 'tov36' | 'fta36' | 'tpa36'
  | 'tpPct' | 'twoPct' | 'ftPct' | 'ts' | 'astTov' | 'usg' | 'bpm' | 'obpm' | 'dbpm' | 'per'
  | 'mpg' | 'avail' | 'height' | 'weight' | 'youth';

type Metrics = Record<MetricKey, number>;

const PRIOR_PER_MIN = { pts: 0.46, orb: 0.035, drb: 0.12, ast: 0.09, stl: 0.028, blk: 0.019, tov: 0.05, fta: 0.085, tpa: 0.17 };

function metrics(p: RawPlayer, a: Agg, age: number): Metrics {
  const per36 = (count: number, prior: number) => (36 * (count + prior * SHRINK_MIN)) / (a.min + SHRINK_MIN);
  const twoA = a.fga - a.tpa, twoM = a.fgm - a.tpm;
  const shrinkImpact = a.min / (a.min + 800);
  const tsa = a.fga + 0.44 * a.fta;
  return {
    pts36: per36(a.pts, PRIOR_PER_MIN.pts),
    orb36: per36(a.orb, PRIOR_PER_MIN.orb),
    drb36: per36(a.drb, PRIOR_PER_MIN.drb),
    ast36: per36(a.ast, PRIOR_PER_MIN.ast),
    stl36: per36(a.stl, PRIOR_PER_MIN.stl),
    blk36: per36(a.blk, PRIOR_PER_MIN.blk),
    tov36: per36(a.tov, PRIOR_PER_MIN.tov),
    fta36: per36(a.fta, PRIOR_PER_MIN.fta),
    tpa36: per36(a.tpa, PRIOR_PER_MIN.tpa),
    tpPct: (a.tpm + 0.34 * 60) / (a.tpa + 60),
    twoPct: (twoM + 0.53 * 100) / (twoA + 100),
    ftPct: (a.ftm + 0.76 * 40) / (a.fta + 40),
    ts: (a.pts + 0.57 * 2 * 200) / (2 * tsa + 2 * 200),
    astTov: (a.ast + 30) / (a.tov + 20),
    usg: 17 + (a.usg - 17) * shrinkImpact,
    bpm: -2 + (a.bpm + 2) * shrinkImpact,
    obpm: -1 + (a.obpm + 1) * shrinkImpact,
    dbpm: -1 + (a.dbpm + 1) * shrinkImpact,
    per: 12 + (a.per - 12) * shrinkImpact,
    mpg: a.gp > 0 ? a.min / a.gp : 12,
    avail: a.games > 0 ? a.gp / a.games : 0.8,
    height: p.heightCm,
    weight: p.weightKg,
    youth: 30 - Math.abs(age - 25) - Math.max(0, age - 30) * 1.5,
  };
}

// ---------- attribute recipes: weighted sums of metric z-scores ----------

type Recipe = Partial<Record<MetricKey, number>>;

const RECIPES: Record<Attr, Recipe> = {
  closeShot:   { twoPct: 0.6, height: 0.25, pts36: 0.15 },
  layup:       { twoPct: 0.45, fta36: 0.25, pts36: 0.2, youth: 0.1 },
  dunk:        { height: 0.35, twoPct: 0.25, blk36: 0.2, youth: 0.2 },
  postScoring: { twoPct: 0.35, weight: 0.3, pts36: 0.25, height: 0.1 },
  midRange:    { ftPct: 0.5, twoPct: 0.2, pts36: 0.3 },
  threePoint:  { tpPct: 0.6, tpa36: 0.4 },
  freeThrow:   { ftPct: 1 },
  drawFoul:    { fta36: 0.8, usg: 0.2 },
  ballHandle:  { ast36: 0.45, usg: 0.3, tov36: -0.1, height: -0.25 },
  passing:     { ast36: 0.7, astTov: 0.3 },
  vision:      { ast36: 0.5, astTov: 0.35, obpm: 0.15 },
  offIQ:       { obpm: 0.5, ts: 0.3, tov36: -0.2 },
  perimeterD:  { dbpm: 0.4, stl36: 0.4, height: -0.1, youth: 0.1 },
  interiorD:   { dbpm: 0.35, blk36: 0.35, height: 0.2, weight: 0.1 },
  helpD:       { dbpm: 0.6, stl36: 0.2, blk36: 0.2 },
  steal:       { stl36: 1 },
  block:       { blk36: 0.85, height: 0.15 },
  offRebound:  { orb36: 0.9, height: 0.1 },
  defRebound:  { drb36: 0.9, height: 0.1 },
  speed:       { height: -0.45, weight: -0.25, youth: 0.3 },
  acceleration:{ height: -0.4, weight: -0.2, youth: 0.4 },
  strength:    { weight: 0.8, height: 0.2 },
  vertical:    { blk36: 0.3, weight: -0.2, youth: 0.3, orb36: 0.2 },
  stamina:     { mpg: 0.7, youth: 0.3 },
  durability:  { avail: 0.8, youth: 0.2 },
  clutch:      { per: 0.5, usg: 0.3, ts: 0.2 },
};

// Positional weights for OVR (attribute importance). Unlisted attrs weigh 1.
const OVR_W: Record<Position, Partial<Record<Attr, number>>> = {
  PG: { ballHandle: 3, passing: 3, vision: 2.5, threePoint: 2.5, perimeterD: 2, speed: 2, offIQ: 2, layup: 1.5, steal: 1.5, block: 0.3, postScoring: 0.3, offRebound: 0.3, strength: 0.5 },
  SG: { threePoint: 3, midRange: 2, ballHandle: 2, perimeterD: 2.5, offIQ: 2, layup: 1.5, speed: 1.5, steal: 1.5, block: 0.4, postScoring: 0.4, offRebound: 0.4 },
  SF: { threePoint: 2.5, perimeterD: 2.5, helpD: 2, layup: 1.5, midRange: 1.5, offIQ: 2, defRebound: 1.2, strength: 1.2 },
  PF: { interiorD: 2, helpD: 2, defRebound: 2, strength: 2, closeShot: 2, threePoint: 1.5, postScoring: 1.5, block: 1.5, ballHandle: 0.6, vision: 0.7 },
  C:  { interiorD: 3, block: 2.5, defRebound: 2.5, offRebound: 2, closeShot: 2.5, strength: 2, postScoring: 1.5, dunk: 1.5, threePoint: 0.5, ballHandle: 0.3, speed: 0.5, passing: 0.6 },
};

// ---------- main ----------

const SEASON_START = new Date('2026-10-01');

export function ageOf(birthDate: string, at: Date = SEASON_START): number {
  const b = new Date(birthDate);
  return (at.getTime() - b.getTime()) / (365.25 * 864e5);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function zStats(values: number[]) {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length) || 1;
  return { mean, sd };
}

/** Rookie / no-stats players: synthesize a z-profile from draft slot + body. */
function rookieBase(p: RawPlayer, rng: Rng): number {
  if (p.draft && p.draft.round === 1) return 0.4 - (p.draft.pick - 1) * 0.035 + gauss(rng) * 0.2; // #1 ≈ +0.4, #30 ≈ -0.6
  if (p.draft) return -0.8 + gauss(rng) * 0.25;
  return -1.0 + gauss(rng) * 0.25;
}

export function buildRatings(players: RawPlayer[]): Map<string, PlayerRatings> {
  const rows = players.map((p) => {
    const age = ageOf(p.birthDate);
    const a = aggregate(p);
    return { p, age, a, m: metrics(p, a, age) };
  });

  // Pool = real rotation players, so z is relative to NBA-level play.
  const pool = rows.filter((r) => r.a.min >= 1500);
  const dist = {} as Record<MetricKey, { mean: number; sd: number }>;
  for (const k of Object.keys(rows[0].m) as MetricKey[]) {
    dist[k] = zStats((pool.length > 30 ? pool : rows).map((r) => r.m[k]));
  }

  // First pass: raw attr z + impact z, so OVR can be normalized across league.
  const pre = rows.map(({ p, age, a, m }) => {
    const rng = mulberry32(hashString(p.id));
    const hasStats = a.min >= 100;
    const rook = hasStats ? 0 : rookieBase(p, rng);
    const blend = hasStats ? Math.min(1, a.min / 1200) : 0; // low-minute guys lean on rookie-style prior
    const z = (k: MetricKey) => (m[k] - dist[k].mean) / dist[k].sd;

    const attrZ = {} as Record<Attr, number>;
    for (const attr of ATTRS) {
      let s = 0, wsum = 0;
      for (const [k, w] of Object.entries(RECIPES[attr]) as [MetricKey, number][]) { s += z(k) * w; wsum += Math.abs(w); }
      const statZ = s / wsum;
      const bodyOnly = ['speed', 'acceleration', 'strength'].includes(attr);
      attrZ[attr] = bodyOnly ? statZ : statZ * blend + (rook + statZ * 0.3) * (1 - blend);
    }
    const pos = p.positions[0] ?? 'SF';
    let ws = 0, wt = 0;
    for (const attr of ATTRS) { const w = OVR_W[pos][attr] ?? 1; ws += attrZ[attr] * w; wt += w; }
    const impactZ = hasStats ? (m.bpm - dist.bpm.mean) / dist.bpm.sd * blend + rook * (1 - blend) : rook;
    return { p, age, a, m, rng, attrZ, rawOvr: 0.55 * (ws / wt) + 0.45 * impactZ };
  });

  const ovrDist = zStats(pre.filter((r) => r.a.min >= 1500).map((r) => r.rawOvr));
  const out = new Map<string, PlayerRatings>();

  for (const { p, age, a, m, rng, attrZ, rawOvr } of pre) {
    const attrs = {} as Attributes;
    for (const attr of ATTRS) attrs[attr] = Math.round(clamp(62 + attrZ[attr] * 13 + gauss(rng) * 1.5, 25, 99));
    // Age decline on physicals.
    if (age > 30) for (const k of ['speed', 'acceleration', 'vertical'] as const) attrs[k] = Math.max(25, attrs[k] - Math.round((age - 30) * 2));

    const ovrZ = (rawOvr - ovrDist.mean) / ovrDist.sd;
    const ovr = Math.round(clamp(74 + ovrZ * 7, 40, 99));
    const growth = Math.max(0, 25 - age) * 2.6 + gauss(rng) * 3;
    const pot = Math.round(clamp(Math.max(ovr, ovr + growth), ovr, 99));

    const fga = Math.max(a.fga, 1);
    const pos = p.positions[0] ?? 'SF';
    const big = pos === 'C' || pos === 'PF';
    const shrinkRate = (v: number, prior: number, n: number) => (v * n + prior * 150) / (n + 150);
    const tend: Tendencies = {
      usage: clamp(m.usg / 100, 0.08, 0.38),
      threeRate: clamp(shrinkRate(a.tpa / fga, big ? 0.28 : 0.42, a.fga), 0, 0.9),
      rimRate: big ? 0.65 : pos === 'PG' ? 0.4 : 0.45,
      ftRate: clamp(shrinkRate(a.fta / fga, 0.25, a.fga), 0.05, 0.7),
      passRate: clamp(0.35 + (attrZ.passing - attrZ.closeShot) * 0.1, 0.1, 0.8),
    };
    const r20 = () => 1 + Math.floor(rng() * 20);
    out.set(p.id, {
      attrs, ovr, pot, tend,
      personality: { ego: clamp(r20() + Math.round(ovrZ * 3), 1, 20), workEthic: r20(), loyalty: r20(), temperament: r20() },
      injuryProne: clamp(0.5 - (attrs.durability - 62) / 60, 0.05, 0.95),
    });
  }
  return out;
}
