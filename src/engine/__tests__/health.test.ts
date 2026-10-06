import { expect, it } from 'vitest';
import nbaTeams from '../../../data/nba/teams.json';
import nbaPlayers from '../../../data/nba/players.json';
import elTeams from '../../../data/el/teams.json';
import elPlayers from '../../../data/el/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { simToEndOfSeason } from '../season';
import { extendCareer, offseasonStep, simOffseason } from '../offseason';
import { payroll, rosterOf } from '../cba';
import { freeAgents } from '../freeagency';

const teams = [...(nbaTeams as Team[]), ...(elTeams as Team[])];
const players = [...(nbaPlayers as RawPlayer[]), ...(elPlayers as RawPlayer[])];

// Long synchronous sims starve vitest's worker RPC; yield between seasons.
const breathe = () => new Promise((r) => setTimeout(r, 0));

it('the league stays healthy across seasons, in both competitions', async () => {
  const s = newGame(teams, players, '1610612738', 11, undefined, { maxSeasons: 0 });
  for (let season = 0; season < 3; season++) {
    simToEndOfSeason(s);
    await breathe();
    simOffseason(s);
    await breathe();
    const nba = Object.values(s.teams).filter((t) => (t.league ?? 'NBA') === 'NBA');
    const el = Object.values(s.teams).filter((t) => t.league === 'EL');
    const sizes = nba.map((t) => rosterOf(s, t.id).length);
    const elPay = el.map((t) => payroll(s, t.id) / 1e6);
    const fa = freeAgents(s);
    console.log(s.season, 'NBA rosters', Math.min(...sizes), '-', Math.max(...sizes), '| EL payroll', Math.min(...elPay).toFixed(1), '-', Math.max(...elPay).toFixed(1), 'M | FA 70+', fa.filter((p) => p.ratings.ovr >= 70).length, '| players', Object.keys(s.players).length);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(13); // includes the unmanaged user team (safety net)
    expect(Math.max(...elPay)).toBeLessThan(35);
    expect(fa.filter((p) => p.ratings.ovr >= 68).length).toBeGreaterThan(5);
    expect(s.careerOver).toBeFalsy();
    const gl = Object.values(s.players).filter((p) => !p.teamId && p.affiliate);
    console.log('  G League unsigned', gl.length, 'assigned', Object.values(s.players).filter((p) => p.assigned).length);
    expect(gl.length).toBeGreaterThanOrEqual(30 * 6);
  }
  const ids = s.games.map((g) => g.id);
  expect(new Set(ids).size).toBe(ids.length);
}, 600000);

it('a finished career can keep going', () => {
  const s = newGame(nbaTeams as Team[], nbaPlayers as RawPlayer[], '1610612738', 12, undefined, { maxSeasons: 1 });
  simToEndOfSeason(s);
  offseasonStep(s);
  expect(s.careerOver).toBe(true);
  extendCareer(s, 5);
  expect(s.careerOver).toBe(false);
  expect(s.maxSeasons).toBe(6);
  expect(s.offseason?.stage).toBe('draft');
  simOffseason(s);
  expect(s.season).toBe('2027-28');
  expect(s.history).toHaveLength(1);
}, 300000);
