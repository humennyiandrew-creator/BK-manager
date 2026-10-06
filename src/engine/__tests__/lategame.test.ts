import { expect, it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { decide, lateDuration, makeSide, NBA_RULES } from '../sim/fast';
import { LiveMatch } from '../sim/live';
import { mulberry32 } from '../rng';

const world = () => newGame(teams as Team[], players as RawPlayer[], '1610612738', 9);

it('trailing defences foul late, leaders foul up three, offences hold for the last shot', () => {
  const s = world();
  const [a, b] = Object.keys(s.teams).filter((t) => (s.teams[t].league ?? 'NBA') === 'NBA');
  const off = makeSide(s.teams[a], s.players, true), def = makeSide(s.teams[b], s.players, false);
  const rng = mulberry32(3);
  const late = (clock: number) => ({ transition: false, late: { period: 4, periods: 4, clock } });
  off.pts = 100; def.pts = 95;  // defence down five, 30 seconds left
  expect(decide(off, def, rng, NBA_RULES, late(30)).event).toBe('intentional-foul');
  off.pts = 97; def.pts = 100;  // defence up three, 5 seconds left
  expect(decide(off, def, rng, NBA_RULES, late(5)).event).toBe('intentional-foul');
  off.pts = 100; def.pts = 97;  // defence down three with the shot clock off: play defence
  expect(decide(off, def, rng, NBA_RULES, late(15)).event).not.toBe('intentional-foul');
  off.pts = 90; def.pts = 90;   // tied, 20 seconds: hold for the last shot
  expect(lateDuration(off, def, 9, 4, 4, 20, rng)).toBeGreaterThan(18);
  off.pts = 90; def.pts = 88;   // two-for-one with 35 seconds left in the third
  expect(lateDuration(off, def, 15, 3, 4, 35, rng)).toBeLessThan(8);
  s.teams[b].tactics.late = { foul: false, foulUp3: false, hold: true, twoForOne: true, hack: null };
  off.pts = 100; def.pts = 95;
  expect(decide(off, def, rng, NBA_RULES, late(30)).event).not.toBe('intentional-foul');
});

it('live games report injuries on the floor and finish cleanly', () => {
  const s = world();
  const [a, b] = Object.keys(s.teams).filter((t) => (s.teams[t].league ?? 'NBA') === 'NBA');
  let hurt = 0, games = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const m = new LiveMatch(s.teams[a], s.teams[b], s.players, seed, 0);
    m.start();
    m.simToEnd();
    const r = m.result();
    expect(r.home).not.toBe(r.away);
    expect(Array.isArray(r.liveInjuries)).toBe(true);
    hurt += r.liveInjuries!.length;
    games++;
    for (const inj of r.liveInjuries!) {
      const line = [...r.box!.home, ...r.box!.away].find((l) => l.id === inj.id)!;
      expect(line).toBeTruthy();
    }
  }
  console.log('live injuries per game', (hurt / games).toFixed(2));
  expect(hurt / games).toBeLessThan(1);
}, 120000);
