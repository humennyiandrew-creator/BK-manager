// Lazy, memoized load of the (large) league data files. Only touched on New Game / team browsing.
import type { RawPlayer, Team } from '../engine/types';

let cache: Promise<{ teams: Team[]; players: RawPlayer[] }> | null = null;

export function loadLeagueData(): Promise<{ teams: Team[]; players: RawPlayer[] }> {
  if (!cache) {
    cache = Promise.all([
      import('@data/nba/teams.json') as Promise<{ default: Team[] }>,
      import('@data/nba/players.json') as Promise<{ default: RawPlayer[] }>
    ]).then(([t, p]) => ({ teams: t.default, players: p.default }));
  }
  return cache;
}
