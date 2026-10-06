import { expect, it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { advanceDay } from '../season';
import { affiliateName, affiliateRoster, assign, canAssign, recall } from '../gleague';
import { rosterOf } from '../cba';

it('affiliates play, develop and feed call-ups', async () => {
  const s = newGame(teams as Team[], players as RawPlayer[], '1610612738', 3);
  expect(affiliateName(s, '1610612738')).toBe('Maine Celtics');
  const aff = affiliateRoster(s, '1610612738');
  expect(aff.length).toBe(8);
  const young = rosterOf(s, s.userTeamId).filter((p) => canAssign(s, p)).sort((a, b) => a.ratings.ovr - b.ratings.ovr)[0];
  expect(young).toBeTruthy();
  expect(assign(s, young.id)).toBeNull();
  expect(s.teams[s.userTeamId].rotation.slice(0, 10)).not.toContain(young.id);
  for (let i = 0; i < 70; i++) { advanceDay(s); if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0)); }
  expect(young.gl?.gp ?? 0).toBeGreaterThan(5);
  expect(young.season.gp).toBe(0); // never played an NBA game while down
  const assignedAI = Object.values(s.players).filter((p) => p.assigned && p.teamId !== s.userTeamId).length;
  console.log('young', young.lastName, young.gl, 'AI assigned', assignedAI);
  expect(assignedAI).toBeGreaterThan(5);
  expect(recall(s, young.id)).toBeNull();
  expect(young.assigned).toBe(false);
}, 200000);
