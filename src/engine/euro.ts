// Euro club economics: wages, budgets and buyouts (no salary cap — the board sets a wage budget).
import type { GameState, Player } from './model';
import type { Contract } from './types';
import { seasonLabel } from './cba';
import { ageOf } from './ratings';

/** Net annual wage for a European club player, in USD. Stars ≈ $4–6M, rotation ≈ $400–900K. */
export function euroWage(ovr: number, age: number): number {
  const base = 60_000 * Math.exp((ovr - 55) / 7.2);
  const prime = age >= 24 && age <= 32 ? 1 : age < 24 ? 0.8 : 0.85;
  return Math.round(Math.min(6_500_000, Math.max(70_000, base * prime)) / 5_000) * 5_000;
}

export function euroSalary(p: Player, seasonYear: number): Contract {
  const wage = euroWage(p.ratings.ovr, ageOf(p.birthDate, new Date(`${seasonYear}-10-01`)));
  const years = p.ratings.ovr >= 72 ? 2 : 1;
  return {
    salaries: Array.from({ length: years }, (_, i) => ({ season: seasonLabel(seasonYear + i), amount: Math.round(wage * 1.05 ** i) })),
    type: 'standard',
  };
}

/** What an NBA club must pay to release a European player from his contract mid-deal. */
export function buyoutCost(s: GameState, p: Player): number {
  const years = p.contract?.salaries.filter((x) => x.season >= s.season).length ?? 0;
  const wage = p.contract?.salaries[0]?.amount ?? euroWage(p.ratings.ovr, 27);
  return Math.round(wage * (0.5 + 0.35 * Math.max(0, years - 1)));
}

/** Wage budget a European board grants, driven by club stature and last season's results. */
export function euroBudget(s: GameState, teamId: string): number {
  const t = s.teams[teamId];
  const cap = t.arenaCapacity || 10_000;
  const base = 8_000_000 + cap * 400;
  return Math.round(base * (s.board?.budgetMul ?? 1));
}
