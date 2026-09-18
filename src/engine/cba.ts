// CBA-lite: cap, tax, aprons, min/max, rookie scale, salary matching, contract asks.
import type { GameState, Player } from './model';
import { ageOf } from './ratings';

export interface CapNumbers { cap: number; tax: number; apron1: number; apron2: number; minRookie: number; mle: number; taxMle: number }

/** 2026-27 projections, grown 7%/season after. */
export function capNumbers(seasonYear: number): CapNumbers {
  const g = 1.07 ** (seasonYear - 2026);
  const r = (v: number) => Math.round((v * g) / 1000) * 1000;
  return { cap: r(165_000_000), tax: r(200_000_000), apron1: r(209_000_000), apron2: r(222_000_000), minRookie: r(1_300_000), mle: r(15_100_000), taxMle: r(6_100_000) };
}

export const seasonLabel = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;

/** Season whose cap sheet matters right now: next season once the offseason starts. */
export const capYear = (s: GameState) => (s.phase === 'offseason' ? s.seasonYear + 1 : s.seasonYear);
export const capSeason = (s: GameState) => seasonLabel(capYear(s));

export function minSalary(seasonYear: number, yearsPro: number): number {
  return Math.round(capNumbers(seasonYear).minRookie * (1 + Math.min(10, yearsPro) * 0.17));
}

export function maxSalary(seasonYear: number, yearsPro: number): number {
  const pct = yearsPro >= 10 ? 0.35 : yearsPro >= 7 ? 0.3 : 0.25;
  return Math.round(capNumbers(seasonYear).cap * pct);
}

export function salaryIn(p: Player, season: string): number {
  return p.contract?.salaries.find((x) => x.season === season)?.amount ?? 0;
}

export function yearsLeft(p: Player, season: string): number {
  return p.contract?.salaries.filter((x) => x.season >= season).length ?? 0;
}

export const rosterOf = (s: GameState, teamId: string) => Object.values(s.players).filter((p) => p.teamId === teamId && !p.retired);
export const isTwoWay = (p: Player) => p.contract?.type === 'two-way';

/** All rosters in one pass over players (use instead of rosterOf in loops over teams). */
export function rostersByTeam(s: GameState): Map<string, Player[]> {
  const m = new Map<string, Player[]>(Object.keys(s.teams).map((id) => [id, []]));
  for (const p of Object.values(s.players)) if (p.teamId && !p.retired) m.get(p.teamId)?.push(p);
  return m;
}

/** Team strength (avg OVR of top 8 players not out long-term) and rank, one pass. */
export function leagueStrength(s: GameState): Map<string, { avg: number; rank: number }> {
  const out = new Map<string, { avg: number; rank: number }>();
  for (const [id, list] of rostersByTeam(s)) {
    const top = list.filter((p) => !p.injury || p.injury.daysLeft < 30).map((p) => p.ratings.ovr).sort((a, b) => b - a).slice(0, 8);
    out.set(id, { avg: top.reduce((x, v) => x + v, 0) / Math.max(1, top.length), rank: 0 });
  }
  [...out.entries()].sort((a, b) => b[1].avg - a[1].avg).forEach(([, v], i) => (v.rank = i + 1));
  return out;
}

/** Cap payroll (two-way contracts don't count). */
export function payroll(s: GameState, teamId: string, season = s.season): number {
  const dead = (s.teams[teamId].deadCap ?? []).filter((d) => d.season === season).reduce((x, d) => x + d.amount, 0);
  return dead + rosterOf(s, teamId).reduce((sum, p) => sum + (isTwoWay(p) ? 0 : salaryIn(p, season)), 0);
}

/** Progressive tax: $1.50 per $1 for first $5M over, then 1.75, 2.50, 3.25, +0.50 per extra $5M. */
export function luxuryTax(pay: number, seasonYear: number): number {
  const over = pay - capNumbers(seasonYear).tax;
  if (over <= 0) return 0;
  let tax = 0, rate = 1.5, rest = over;
  const rates = [1.5, 1.75, 2.5, 3.25];
  for (let i = 0; rest > 0; i++) {
    rate = rates[i] ?? 3.25 + (i - 3) * 0.5;
    const chunk = Math.min(rest, 5_000_000);
    tax += chunk * rate;
    rest -= chunk;
  }
  return Math.round(tax);
}

export type CapLevel = 'under' | 'over' | 'tax' | 'apron1' | 'apron2';
export function capLevel(pay: number, seasonYear: number): CapLevel {
  const c = capNumbers(seasonYear);
  return pay >= c.apron2 ? 'apron2' : pay >= c.apron1 ? 'apron1' : pay >= c.tax ? 'tax' : pay >= c.cap ? 'over' : 'under';
}

/** Salary matching for one side of a trade. Returns null if legal, else reason. */
export function tradeSalaryCheck(s: GameState, teamId: string, outgoing: number, incoming: number): string | null {
  const before = payroll(s, teamId, capSeason(s));
  const after = before - outgoing + incoming;
  const c = capNumbers(capYear(s));
  if (after <= c.cap) return null;
  if (after >= c.apron1 && incoming > outgoing) return 'Over the first apron: cannot take back more salary than sent out';
  if (incoming > outgoing * 1.25 + 250_000) return 'Salaries do not match (max 125% + $250K incoming)';
  return null;
}

/** Rookie scale for first-round picks (4 years, years 3–4 team options). */
export function rookieScale(pick: number, seasonYear: number): { salaries: { season: string; amount: number }[] } {
  const base = capNumbers(seasonYear).cap * (0.08 * Math.exp(-(pick - 1) / 10.5) + 0.012);
  return {
    salaries: [0, 1, 2, 3].map((i) => ({ season: seasonLabel(seasonYear + i), amount: Math.round(base * (1 + i * 0.05)) })),
  };
}

// ---------- market value ----------

/** Fair annual salary for a player given current ratings and age. */
export function marketValue(p: Player, seasonYear: number): number {
  const age = ageOf(p.birthDate, new Date(`${seasonYear}-10-01`));
  const upside = age <= 24 ? (p.ratings.pot - p.ratings.ovr) * (0.45 - (age - 19) * 0.07) : 0;
  const eff = p.ratings.ovr + Math.max(0, upside) - Math.max(0, age - 30) * 1.2;
  const pct = 0.35 / (1 + Math.exp(-(eff - 82) / 3.5));
  const c = capNumbers(seasonYear);
  const v = pct * c.cap;
  return Math.round(Math.min(maxSalary(seasonYear, p.yearsPro), Math.max(minSalary(seasonYear, p.yearsPro), v)) / 10_000) * 10_000;
}

export function desiredYears(p: Player, seasonYear: number): number {
  const age = ageOf(p.birthDate, new Date(`${seasonYear}-10-01`));
  return age <= 25 ? 4 : age <= 29 ? 3 : age <= 32 ? 2 : 1;
}

/** Contract rows for a new deal starting in seasonYear with 5% raises. */
export function contractRows(seasonYear: number, amount: number, years: number) {
  return Array.from({ length: years }, (_, i) => ({ season: seasonLabel(seasonYear + i), amount: Math.round(amount * 1.05 ** i) }));
}

/** Can teamId sign a free agent at `amount` right now? Returns null if yes, else reason. Sets which exception is used. */
export function signingCheck(s: GameState, teamId: string, p: Player, amount: number, twoWay = false): { reason: string | null; usesMle: boolean } {
  const roster = rosterOf(s, teamId);
  if (twoWay) {
    return { reason: roster.filter(isTwoWay).length >= 3 ? 'Two-way slots full (3)' : null, usesMle: false };
  }
  if (roster.filter((x) => !isTwoWay(x)).length >= 15) return { reason: 'Roster full (15 standard contracts)', usesMle: false };
  const c = capNumbers(capYear(s));
  const pay = payroll(s, teamId, capSeason(s));
  if (amount <= minSalary(capYear(s), p.yearsPro) * 1.001) return { reason: null, usesMle: false };
  if (pay + amount <= c.cap) return { reason: null, usesMle: false };
  const team = s.teams[teamId];
  const mle = pay + amount >= c.apron1 ? c.taxMle : c.mle;
  if (!team.mleUsed && amount <= mle && pay + amount < c.apron2) return { reason: null, usesMle: true };
  return { reason: team.mleUsed ? 'Over the cap and MLE already used — minimum contracts only' : `Over the cap: max offer via MLE is $${(mle / 1e6).toFixed(1)}M`, usesMle: false };
}
