// AI depth chart + target minutes.
import type { Player, TeamState } from './model';
import type { Position } from './types';

const SLOTS: Position[][] = [['PG', 'SG'], ['SG', 'SF', 'PG'], ['SF', 'SG', 'PF'], ['PF', 'SF', 'C'], ['C', 'PF']];
const MINUTES = [35, 33, 32, 31, 29, 24, 20, 16, 12, 8]; // sums 240

/** Healthy, with the big club (not on G League assignment) and not being rested tonight. */
export const available = (p: Player) => !p.injury && !p.assigned && !p.resting;

/** Best starting five by slot fit, then bench by OVR. */
export function autoRotation(players: Player[]): string[] {
  const pool = players.filter(available).sort((a, b) => b.ratings.ovr - a.ratings.ovr);
  const starters: Player[] = [];
  for (const slot of SLOTS) {
    // Accept a fit within 4 OVR of the best remaining player, else take the best.
    const best = pool.find((p) => !starters.includes(p));
    if (!best) break;
    const fit = pool.find((p) => !starters.includes(p) && p.positions.some((x) => slot.includes(x)) && p.ratings.ovr >= best.ratings.ovr - 4);
    starters.push(fit ?? best);
  }
  const bench = pool.filter((p) => !starters.includes(p));
  const injured = players.filter((p) => !available(p));
  return [...starters, ...bench, ...injured].map((p) => p.id);
}

export function autoMinutes(rotation: string[], players: Record<string, Player>): Record<string, number> {
  const out: Record<string, number> = {};
  let i = 0;
  for (const id of rotation) {
    out[id] = available(players[id]) ? MINUTES[i++] ?? 0 : 0;
  }
  return out;
}

export function refreshRotation(team: TeamState, players: Record<string, Player>) {
  const roster = Object.values(players).filter((p) => p.teamId === team.id);
  if (team.customRotation) {
    // Keep the user's order; drop departed players, append new ones, injured to the back.
    const ids = team.rotation.filter((id) => players[id]?.teamId === team.id);
    for (const p of roster) if (!ids.includes(p.id)) ids.push(p.id);
    team.rotation = [...ids.filter((id) => available(players[id])), ...ids.filter((id) => !available(players[id]))];
    const mins = team.rotation.map((id) => (available(players[id]) ? team.minutes[id] ?? 0 : 0));
    const sum = mins.reduce((x, m) => x + m, 0);
    team.minutes = Object.fromEntries(team.rotation.map((id, i) => [id, sum > 0 ? Math.round((mins[i] * 240) / sum) : 0]));
    if (sum === 0) team.minutes = autoMinutes(team.rotation, players);
    return;
  }
  team.rotation = autoRotation(roster);
  team.minutes = autoMinutes(team.rotation, players);
}
