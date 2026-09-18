// Shared market-size + team-strength helpers for mgmt systems.
import type { GameState } from '../model';
import { hashString } from '../rng';

const BIG = new Set(['NYK', 'LAL', 'GSW', 'LAC', 'CHI', 'BOS', 'BKN', 'PHI', 'TOR', 'MIA', 'DAL', 'HOU']);
const SMALL = new Set(['MEM', 'NOP', 'OKC', 'SAC', 'UTA', 'CHA', 'MIL', 'IND', 'POR', 'SAS', 'MIN', 'ORL']);

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Market size multiplier by team abbr: big ~1.2-1.5, small ~0.8-0.95, else 1.0. Deterministic per abbr. */
export function marketFactor(abbr: string): number {
  const noise = (hashString(abbr) % 100) / 100;
  if (BIG.has(abbr)) return 1.2 + noise * 0.3;
  if (SMALL.has(abbr)) return 0.8 + noise * 0.15;
  return 1.0;
}

/** Avg OVR of a team's rotation-top-8 (by OVR) — a simple team-strength proxy. */
export function teamStrength(s: GameState, teamId: string): number {
  const roster = Object.values(s.players)
    .filter((p) => p.teamId === teamId && !p.retired)
    .sort((a, b) => b.ratings.ovr - a.ratings.ovr)
    .slice(0, 8);
  if (!roster.length) return 60;
  return roster.reduce((sum, p) => sum + p.ratings.ovr, 0) / roster.length;
}

/** 1 = strongest team in the league by teamStrength. */
export function teamStrengthRank(s: GameState, teamId: string): number {
  const ranked = Object.keys(s.teams)
    .map((id) => ({ id, avg: teamStrength(s, id) }))
    .sort((a, b) => b.avg - a.avg);
  return ranked.findIndex((r) => r.id === teamId) + 1;
}

/** Sum of OVR of a team's top-3 players — "star power". */
export function top3Ovr(s: GameState, teamId: string): number {
  return Object.values(s.players)
    .filter((p) => p.teamId === teamId && !p.retired)
    .sort((a, b) => b.ratings.ovr - a.ratings.ovr)
    .slice(0, 3)
    .reduce((sum, p) => sum + p.ratings.ovr, 0);
}
