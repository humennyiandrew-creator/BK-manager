import { expect, it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { advanceDay, userGameToday } from '../season';
import { objectiveStatus, objectiveValue } from '../objectives';
import type { MatchObjective } from '../model';

it('sponsor objectives are built, settled and pay out sensibly', () => {
  const s = newGame(teams as Team[], players as RawPlayer[], '1610612738', 21);
  let games = 0;
  for (let i = 0; i < 400 && (s.phase === 'preseason' || s.phase === 'regular'); i++) {
    const g = userGameToday(s);
    if (g) {
      games++;
      expect(s.matchObjectives?.gameId).toBe(g.id);
      expect(s.matchObjectives?.list.length).toBe(3);
    }
    advanceDay(s);
  }
  const log = s.objectiveLog ?? [];
  const met = log.reduce((a, x) => a + x.met, 0), total = log.reduce((a, x) => a + x.total, 0);
  const earned = log.reduce((a, x) => a + x.earned, 0);
  console.log('games', games, 'logged', log.length, 'met', `${met}/${total}`, `${((met / total) * 100).toFixed(0)}%`, 'earned (last 40)', (earned / 1e6).toFixed(1) + 'M');
  expect(log.length).toBeGreaterThan(30);
  expect(met / total).toBeGreaterThan(0.2);
  expect(met / total).toBeLessThan(0.7);
});

it('live status banks counting stats and loses "or fewer" goals', () => {
  const line = (pts: number, tov: number, tpm: number) => ({ id: 'a', starter: true, gp: 1, gs: 1, min: 30, pts, fgm: 0, fga: 0, tpm, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov, pf: 0, pm: 0 });
  const threes: MatchObjective = { id: '1', sponsor: 'x', stat: 'threes', target: 3, label: '', reward: 1, hype: 1 };
  const tov: MatchObjective = { id: '2', sponsor: 'x', stat: 'turnovers', target: 2, under: true, label: '', reward: 1, hype: 1 };
  const ctx = (l: ReturnType<typeof line>) => ({ us: { lines: [l], pts: l.pts }, them: { lines: [], pts: 0 } });
  expect(objectiveStatus(threes, objectiveValue(threes, ctx(line(9, 0, 3))), false)).toBe('met');
  expect(objectiveStatus(threes, objectiveValue(threes, ctx(line(6, 0, 2))), false)).toBe('off');
  expect(objectiveStatus(tov, objectiveValue(tov, ctx(line(0, 1, 0))), false)).toBe('on');
  expect(objectiveStatus(tov, objectiveValue(tov, ctx(line(0, 3, 0))), false)).toBe('failed');
});
