import { expect, it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { tacticLab } from '../playbook/lab';

it('tactic lab reports a delta without mutating tactics', () => {
  const s = newGame(teams as Team[], players as RawPlayer[], '1610612759', 5);
  const before = JSON.stringify(s.teams['1610612759'].tactics);
  const t0 = Date.now();
  const r = tacticLab(s, '1610612759', { offense: 'post', threeFocus: 15, crashGlass: 80 });
  console.log('SAS paint lab', r, 'ms', Date.now() - t0);
  expect(JSON.stringify(s.teams['1610612759'].tactics)).toBe(before);
});
