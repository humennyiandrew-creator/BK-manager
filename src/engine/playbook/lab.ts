// Tactic Lab: honest preview of a tactic change — quick fast-sims vs the whole league, same seeds both ways.
import type { GameState, Tactics } from '../model';
import { simGame } from '../sim/fast';
import { mulberry32 } from '../rng';
import { lineupProfile, offenseFit, defenseFit } from './fit';
import { rosterOf } from '../cba';

export interface LabResult { baseline: number; candidate: number; delta: number; margin: number; notes: string[] }

function netRating(s: GameState, teamId: string, n: number): number[] {
  const team = s.teams[teamId];
  const opps = Object.values(s.teams).filter((t) => t.id !== teamId);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const o = opps[i % opps.length];
    const home = i % 2 === 0;
    const r = simGame(home ? team : o, home ? o : team, s.players, mulberry32(7919 * (i + 1)));
    out.push(home ? r.home - r.away : r.away - r.home);
  }
  return out;
}

/** Compare `candidate` tactics to the team's current tactics. Does not mutate state (restores tactics). */
export function tacticLab(s: GameState, teamId: string, candidate: Partial<Tactics>, n = 120): LabResult {
  const team = s.teams[teamId];
  const saved = { ...team.tactics };
  const base = netRating(s, teamId, n);
  team.tactics = { ...saved, ...candidate };
  const cand = netRating(s, teamId, n);
  const five = team.rotation.slice(0, 5).map((id) => s.players[id]).filter(Boolean);
  const prof = lineupProfile(five.length === 5 ? five : rosterOf(s, teamId).slice(0, 5));
  const notes = [...offenseFit(prof, team.tactics).notes, ...defenseFit(prof, team.tactics.defense).notes];
  team.tactics = saved;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const diffs = cand.map((v, i) => v - base[i]);
  const md = mean(diffs);
  const sd = Math.sqrt(diffs.reduce((a, d) => a + (d - md) ** 2, 0) / diffs.length);
  return { baseline: +mean(base).toFixed(1), candidate: +mean(cand).toFixed(1), delta: +md.toFixed(1), margin: +((1.96 * sd) / Math.sqrt(n)).toFixed(1), notes };
}
