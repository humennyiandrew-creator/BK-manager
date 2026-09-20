import { expect, it } from 'vitest';
import nbaTeams from '../../../data/nba/teams.json';
import nbaPlayers from '../../../data/nba/players.json';
import elTeams from '../../../data/el/teams.json';
import elPlayers from '../../../data/el/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { simToEndOfSeason, standings } from '../season';
import { rosterOf } from '../cba';

it('plays a EuroLeague season', () => {
  const teams = [...(nbaTeams as Team[]), ...(elTeams as Team[])];
  const players = [...(nbaPlayers as RawPlayer[]), ...(elPlayers as RawPlayer[])];
  const s = newGame(teams, players, 'EL-MAD', 4);
  const el = Object.values(s.teams).filter((t) => t.league === 'EL');
  expect(el.length).toBe(20);
  for (const t of el) expect(rosterOf(s, t.id).length).toBeGreaterThanOrEqual(10);
  const games = s.games.filter((g) => g.comp === 'EL');
  console.log('EL teams', el.length, 'games', games.length, 'per team', games.filter((g) => g.home === 'EL-MAD' || g.away === 'EL-MAD').length);
  const top = Object.values(s.players).filter((p) => s.teams[p.teamId!]?.league === 'EL').sort((a, b) => b.ratings.ovr - a.ratings.ovr).slice(0, 8);
  console.log('top EL:', top.map((p) => `${p.lastName} ${p.ratings.ovr}`).join(', '));

  const t0 = Date.now();
  simToEndOfSeason(s);
  console.log('phase', s.phase, 'champion', s.champion && s.teams[s.champion].abbr, 'secs', ((Date.now() - t0) / 1000).toFixed(0));
  const played = s.games.filter((g) => g.comp === 'EL' && g.type === 'regular' && g.result);
  const pts = played.reduce((x, g) => x + g.result!.home + g.result!.away, 0) / (played.length * 2);
  console.log('EL scoring', pts.toFixed(1), 'games played', played.length);
  const table = standings(s, undefined, 'EL').slice(0, 5);
  console.log(table.map((r) => `${s.teams[r.teamId].abbr} ${r.w}-${r.l}`).join(', '));
  expect(s.champion).toBeTruthy();
}, 300000);
