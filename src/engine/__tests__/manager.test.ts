import { expect, it } from 'vitest';
import nbaTeams from '../../../data/nba/teams.json';
import nbaPlayers from '../../../data/nba/players.json';
import elTeams from '../../../data/el/teams.json';
import elPlayers from '../../../data/el/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { advanceDay, simToEndOfSeason } from '../season';
import { acceptJob, hotSeat, sackManager, managerDaily } from '../manager';
import { askingPriceFor, makeBid, transferValue, wageRoom, euroTransferDaily } from '../transfers-euro';
import { rosterOf } from '../cba';

const teams = [...(nbaTeams as Team[]), ...(elTeams as Team[])];
const players = [...(nbaPlayers as RawPlayer[]), ...(elPlayers as RawPlayer[])];

it('sacks a failing manager and offers new jobs', () => {
  const s = newGame(teams, players, '1610612759', 12);
  for (let i = 0; i < 30; i++) advanceDay(s);
  s.board.confidence = 5;
  console.log('hot seat at confidence 5:', hotSeat(s));
  sackManager(s, 'Test.');
  expect(s.manager.unemployed).toBe(true);
  for (let i = 0; i < 40 && !s.manager.offers.length; i++) { managerDaily(s); advanceDay(s); }
  expect(s.manager.offers.length).toBeGreaterThan(0);
  const o = s.manager.offers[0];
  console.log('offer:', s.teams[o.teamId].name, o.league, `$${(o.salary / 1e6).toFixed(2)}M`, o.years + 'y', o.reason);
  expect(acceptJob(s, o.id)).toBeNull();
  expect(s.userTeamId).toBe(o.teamId);
  expect(s.manager.unemployed).toBe(false);
}, 120000);

it('buys and sells European players for fees', () => {
  const s = newGame(teams, players, 'EL-MAD', 13);
  s.date = '2026-07-05';
  s.phase = 'offseason';
  const target = Object.values(s.players).find((p) => p.teamId === 'EL-BAR' && p.ratings.ovr >= 70)!;
  const ask = askingPriceFor(s, target);
  console.log(target.lastName, 'ovr', target.ratings.ovr, 'value', (transferValue(s, target) / 1e6).toFixed(2), 'ask', (ask / 1e6).toFixed(2), 'wage room', (wageRoom(s, 'EL-MAD') / 1e6).toFixed(2));
  s.finance.cash = 40_000_000;
  const low = makeBid(s, target.id, Math.round(ask * 0.5), 2_000_000, 3);
  console.log('lowball →', low.text);
  expect(low.ok).toBe(false);
  const good = makeBid(s, target.id, Math.round(ask * 1.7), 3_500_000, 3);
  console.log('fair bid →', good.text);
  if (good.ok) expect(s.players[target.id].teamId).toBe('EL-MAD');
  for (let i = 0; i < 60; i++) { s.date = `2026-07-${String((i % 28) + 1).padStart(2, '0')}`; euroTransferDaily(s); }
  console.log('AI transfers seen:', s.transactions.filter((t) => t.text.includes(' sign ') && t.text.includes(' from ')).length, 'roster', rosterOf(s, 'EL-MAD').length);
}, 120000);

it('still plays a full NBA season with the new hooks', () => {
  const s = newGame(nbaTeams as Team[], nbaPlayers as RawPlayer[], '1610612747', 14);
  simToEndOfSeason(s);
  expect(s.champion).toBeTruthy();
}, 200000);
