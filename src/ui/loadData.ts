// Lazy, memoized load of the (large) league data files. Only touched on New Game / team browsing.
import type { RawPlayer, Team } from '../engine/types';

let cache: Promise<{ teams: Team[]; players: RawPlayer[] }> | null = null;

/** EuroLeague data is optional: if the files aren't built yet the game runs NBA-only. */
async function loadEuroLeague(): Promise<{ teams: Team[]; players: RawPlayer[] }> {
  try {
    const [t, p] = await Promise.all([
      import('@data/el/teams.json') as Promise<{ default: Team[] }>,
      import('@data/el/players.json') as Promise<{ default: RawPlayer[] }>,
    ]);
    const teams = t.default.map((x) => ({ ...x, league: x.league ?? 'EL' }));
    return { teams, players: p.default };
  } catch {
    return { teams: [], players: [] };
  }
}

export function loadLeagueData(): Promise<{ teams: Team[]; players: RawPlayer[] }> {
  if (!cache) {
    cache = Promise.all([
      import('@data/nba/teams.json') as Promise<{ default: Team[] }>,
      import('@data/nba/players.json') as Promise<{ default: RawPlayer[] }>,
      loadEuroLeague(),
    ]).then(([t, p, el]) => ({
      teams: [...t.default.map((x) => ({ ...x, league: x.league ?? 'NBA' })), ...el.teams],
      players: [...p.default, ...el.players],
    }));
  }
  return cache;
}
