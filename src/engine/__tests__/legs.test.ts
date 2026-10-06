import { expect, it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { boxLine, makeSide, startEnergy, tickEnergy } from '../sim/fast';
import { available } from '../rotation';
import { clearRest, setResting } from '../rest';
import { buildPrep, setPlan, systemsVsScheme } from '../prep';
import { applyResult } from '../season';
import type { GameResult } from '../model';

const world = () => newGame(teams as Team[], players as RawPlayer[], '1610612738', 11);

it('tired players start lower and cannot recover past where they started', () => {
  const s = world();
  const t = s.teams[s.userTeamId];
  const id = t.rotation[0];
  s.players[id].fatigue = 60;
  expect(startEnergy(s.players[id])).toBeCloseTo(0.7);
  const side = makeSide(t, s.players, true);
  const sp = side.roster.find((x) => x.p.id === id)!;
  expect(sp.energy).toBeCloseTo(0.7);
  side.court = side.court.filter((x) => x !== sp);
  tickEnergy(side, 600);
  expect(sp.energy).toBeLessThanOrEqual(0.7);
});

it('effort on the floor carries into post-game fatigue', () => {
  const s = world();
  const t = s.teams[s.userTeamId];
  const side = makeSide(t, s.players, true);
  side.intensity = 1;
  tickEnergy(side, 600);
  const pushed = boxLine(side.court[0]);
  expect(pushed.effort).toBe(1);
  side.intensity = -1;
  tickEnergy(side, 600);
  expect(boxLine(side.court[0]).effort ?? 0).toBe(0);

  const g = s.games.find((x) => x.home === t.id || x.away === t.id)!;
  const line = { ...boxLine(side.court[0]), min: 30, gp: 1 };
  const p = s.players[line.id];
  const run = (effort?: number) => {
    p.fatigue = 0;
    const res: GameResult = { home: 100, away: 90, periods: [], box: { home: [{ ...line, effort }], away: [] }, liveInjuries: [] };
    applyResult(s, g, res);
    return p.fatigue;
  };
  const balanced = run(undefined), push = run(1), conserve = run(-1);
  expect(push).toBeGreaterThan(balanced);
  expect(conserve).toBeLessThan(balanced);
});

it('resting a player keeps eight available and clears after the game', () => {
  const s = world();
  const t = s.teams[s.userTeamId];
  const roster = () => Object.values(s.players).filter((p) => p.teamId === t.id);
  const id = t.rotation[0];
  expect(setResting(s, id, true)).toBeNull();
  expect(t.minutes[id] ?? 0).toBe(0);
  expect(makeSide(t, s.players, true).roster.some((x) => x.p.id === id)).toBe(false);
  expect(setResting(s, id, false)).toBeNull();
  expect(roster().filter(available).length).toBe(roster().filter((p) => !p.injury && !p.assigned).length);
  const ids = roster().map((p) => p.id);
  for (const pid of ids.slice(0, ids.length - 8)) expect(setResting(s, pid, true)).toBeNull();
  expect(setResting(s, ids[ids.length - 1], true)).toMatch(/eight/);
  clearRest(s, s.games.find((x) => x.home === t.id || x.away === t.id)!);
  expect(roster().some((p) => p.resting)).toBe(false);
});

it('scouting reads the opponent plan and the matchup for our system', () => {
  const s = world();
  const g = s.games.filter((x) => x.home === s.userTeamId || x.away === s.userTeamId).sort((a, b) => a.date.localeCompare(b.date))[0];
  s.date = g.date;
  buildPrep(s);
  expect(s.prep?.theirPlan).toBeTruthy();
  const opp = s.teams[s.prep!.opponent];
  expect(opp.gamePlan?.opponent).toBe(s.userTeamId);
  expect(setPlan(s, 'contain-star')).toBeNull();
  expect(s.teams[s.userTeamId].gamePlan?.plan).toBe('contain-star');

  const vs = systemsVsScheme('switch');
  expect(vs).toHaveLength(7);
  for (let i = 1; i < vs.length; i++) expect(vs[i - 1].score).toBeGreaterThanOrEqual(vs[i].score);
});
