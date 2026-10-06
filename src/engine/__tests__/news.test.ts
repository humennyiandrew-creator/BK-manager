import { expect, it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { advanceDay } from '../season';
import { awardRaces } from '../news';

it('the league wire, rankings and award races come alive over a season', () => {
  const s = newGame(teams as Team[], players as RawPlayer[], '1610612747', 33);
  for (let i = 0; i < 120; i++) advanceDay(s);
  const news = s.news ?? [];
  const byKind: Record<string, number> = {};
  for (const n of news) byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
  console.log('news', news.length, byKind);
  console.log(news.slice(0, 12).map((n) => `${n.date} [${n.kind}] ${n.headline}`).join('\n'));
  expect(news.length).toBeGreaterThan(20);
  expect(byKind.award).toBeGreaterThan(0);
  expect(byKind.performance).toBeGreaterThan(0);
  const pr = s.powerRankings!;
  expect(pr.ranks.NBA).toHaveLength(30);
  expect(new Set(pr.ranks.NBA).size).toBe(30);
  const races = awardRaces(s);
  console.log('MVP race', races.mvp.map((r) => `${s.players[r.id].lastName} ${r.line}`).join(' | '));
  expect(races.mvp).toHaveLength(5);
  expect(races.roy.length).toBeGreaterThan(0);
}, 120000);
