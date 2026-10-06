import { expect, it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { advanceDay } from '../season';
import { resolveEvent } from '../events';

const breathe = () => new Promise((r) => setTimeout(r, 0));

it('a season has an NBA Cup, All-Star weekend, a deadline day and awards night', async () => {
  const s = newGame(teams as Team[], players as RawPlayer[], '1610612738', 41);
  const cal = s.calendar!;
  const cup = cal.cup!;
  expect(cup.groups).toHaveLength(6);
  const groupGames = s.games.filter((g) => g.cup?.group);
  console.log('cup group games', groupGames.length, 'nights', cup.nights.length);
  expect(groupGames.length).toBeGreaterThanOrEqual(54);
  for (const g of groupGames) expect(cup.nights.includes(g.date) || (g.date >= cup.nights[0] && g.date <= cup.nights.at(-1)!)).toBe(true);
  // Nobody plays twice on one day, and every NBA team still plays 82.
  const perDay = new Map<string, number>();
  for (const g of s.games) for (const t of [g.home, g.away]) perDay.set(`${g.date}|${t}`, (perDay.get(`${g.date}|${t}`) ?? 0) + 1);
  expect(Math.max(...perDay.values())).toBe(1);
  const as = cal.allStar!;
  expect(s.games.some((g) => (g.comp ?? 'NBA') === 'NBA' && g.date >= as.breakStart && g.date <= as.breakEnd)).toBe(false);

  for (let i = 0; i < 260 && !cal.awards; i++) {
    advanceDay(s);
    for (const e of s.events) if (!e.resolved) resolveEvent(s, e.id, e.choices[0].id);
    if (i % 20 === 0) await breathe();
  }
  console.log('knockout', cup.knockout.map((t) => `${t.round} ${s.teams[t.high].abbr}-${s.teams[t.low].abbr} -> ${t.winner && s.teams[t.winner].abbr}`).join(' | '));
  console.log('cup champion', cup.champion && s.teams[cup.champion].name, 'mvp', cup.mvp && s.players[cup.mvp].lastName);
  expect(cup.knockout).toHaveLength(7);
  expect(cup.champion).toBeTruthy();
  expect(as.east).toHaveLength(12);
  expect(as.west).toHaveLength(12);
  expect(as.result).toBeTruthy();
  console.log('deadline trades', cal.deadline.trades, 'all-star', as.result);
  expect(cal.deadline.done).toBe(true);
  expect(cal.awards?.result.mvp).toBeTruthy();
  expect(cal.awards?.result.coy).toBeTruthy();
  console.log('coy', s.teams[cal.awards!.result.coy!].name, 'mvp', s.players[cal.awards!.result.mvp].lastName);
  const counts = new Map<string, number>();
  for (const g of s.games) if (g.type === 'regular' && (g.comp ?? 'NBA') === 'NBA') for (const t of [g.home, g.away]) counts.set(t, (counts.get(t) ?? 0) + 1);
  expect(new Set(counts.values())).toEqual(new Set([82]));
  const news = (s.news ?? []).map((n) => n.kind);
  expect(news).toContain('award');
}, 240000);
