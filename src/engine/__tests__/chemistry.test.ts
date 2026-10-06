import { expect, it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { advanceDay } from '../season';
import { activityReadyIn, chemistryEdge, chemistryReport, leadership, runActivity, setCaptain } from '../chemistry';

it('locker room: captain, activities, cooldowns and weekly chemistry', () => {
  const s = newGame(teams as Team[], players as RawPlayer[], '1610612738', 5);
  const base = chemistryReport(s, s.userTeamId);
  console.log('chem', base.score, base.mood, base.parts.map((p) => `${p.label} ${p.value}`).join(', '));
  expect(base.score).toBeGreaterThanOrEqual(0);
  expect(base.score).toBeLessThanOrEqual(100);

  const cap = base.leaders[0];
  expect(leadership(cap)).toBeGreaterThan(0);
  expect(setCaptain(s, cap.id)).toBeNull();
  const withCap = chemistryReport(s, s.userTeamId);
  expect(withCap.parts.some((p) => p.label.startsWith('Captain'))).toBe(true);

  const cash = s.finance.cash;
  const r = runActivity(s, 'retreat');
  expect(r.ok).toBe(true);
  expect(s.finance.cash).toBe(cash - 250_000);
  expect(chemistryReport(s, s.userTeamId).score).toBeGreaterThan(withCap.score);
  expect(runActivity(s, 'retreat').ok).toBe(false);
  expect(activityReadyIn(s, 'retreat')).toBe(60);

  for (let i = 0; i < 10; i++) advanceDay(s);
  const chems = Object.values(s.teams).map((t) => t.chemistry);
  expect(chems.every((c) => typeof c === 'number')).toBe(true);
  expect(chemistryEdge(90)).toBeGreaterThan(0);
  expect(chemistryEdge(20)).toBeLessThan(0);
});
