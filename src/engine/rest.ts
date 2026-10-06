// Load management: rest a player for his team's next game. The user decides for their own club;
// AI benches sit anyone whose fatigue is 80 or more before a game.
import type { Game, GameState } from './model';
import { refreshRotation, available } from './rotation';

/** Rest (or stop resting) one of the user's players for the next game. */
export function setResting(s: GameState, pid: string, on: boolean): string | null {
  const p = s.players[pid];
  if (!p || p.teamId !== s.userTeamId) return 'Not on our roster';
  if (on && p.injury) return 'He is injured anyway';
  if (on) {
    const fit = Object.values(s.players).filter((x) => x.teamId === s.userTeamId && available(x)).length;
    if (fit <= 8) return 'We need at least eight available players';
  }
  p.resting = on;
  refreshRotation(s.teams[s.userTeamId], s.players);
  return null;
}

/** Game day for AI clubs: sit players whose fatigue is very high (one per team, never below nine available). */
export function aiLoadManagement(s: GameState, today: Game[]) {
  for (const g of today) {
    for (const t of [g.home, g.away]) {
      if (t === s.userTeamId || g.result) continue;
      const roster = Object.values(s.players).filter((p) => p.teamId === t && available(p));
      if (roster.length <= 9) continue;
      const gassed = roster.filter((p) => (p.fatigue ?? 0) >= 80).sort((a, b) => (b.fatigue ?? 0) - (a.fatigue ?? 0))[0];
      if (!gassed) continue;
      gassed.resting = true;
      refreshRotation(s.teams[t], s.players);
    }
  }
}

/** After a game, everyone who sat it out is available again. */
export function clearRest(s: GameState, g: Game) {
  for (const t of [g.home, g.away]) {
    let changed = false;
    for (const p of Object.values(s.players)) if (p.teamId === t && p.resting) { p.resting = false; changed = true; }
    if (changed) refreshRotation(s.teams[t], s.players);
  }
}
