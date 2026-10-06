import { expect, it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { advanceDay } from '../season';
import { resolveEvent } from '../events';
import { tierOf } from '../rivalries';

const breathe = () => new Promise((r) => setTimeout(r, 0));

it('rivalries build heat and storylines unfold over a season', async () => {
  const s = newGame(teams as Team[], players as RawPlayer[], '1610612747', 12);
  const R = s.rivals!;
  console.log('club rivals', R.clubs.map((c) => `${s.teams[c.teamId].abbr} (${c.reason})`), 'player rivals', R.players.map((r) => `${s.players[r.playerId].lastName} v ${s.players[r.rivalId].lastName}`));
  expect(R.clubs.length).toBeGreaterThanOrEqual(1);
  expect(R.players.length).toBeGreaterThanOrEqual(1);
  const types = new Map<string, number>();
  let k = 0;
  for (let i = 0; i < 230 && s.phase !== 'playoffs' && s.phase !== 'offseason'; i++) {
    advanceDay(s);
    for (const e of s.events) if (!e.resolved) { types.set(e.type, (types.get(e.type) ?? 0) + 1); resolveEvent(s, e.id, e.choices[k++ % e.choices.length].id); }
    if (i % 20 === 0) await breathe();
  }
  console.log('clubs', R.clubs.map((c) => `${s.teams[c.teamId].abbr} heat ${c.heat} ${tierOf(c.heat)} ${c.season.w}-${c.season.l}`));
  console.log('players', R.players.map((r) => `${s.players[r.playerId].lastName} v ${s.players[r.rivalId].lastName} heat ${r.heat} ${r.season.w}-${r.season.l}`));
  console.log('acclaim', R.acclaim, 'events', Object.fromEntries(types));
  console.log('stories', (s.stories ?? []).map((x) => `${x.kind}:${s.players[x.playerId]?.lastName} stage ${x.stage} ${x.done ? x.outcome : 'open'} | ${x.log.map((l) => l.text).join(' / ')}`).join('\n'));
  expect(R.clubs.some((c) => c.season.w + c.season.l > 0)).toBe(true);
  expect(Math.max(...R.clubs.map((c) => c.heat))).toBeGreaterThan(20);
  expect(R.players.some((r) => r.season.w + r.season.l > 0)).toBe(true);
  expect((s.stories ?? []).length).toBeGreaterThan(0);
  expect((s.stories ?? []).some((x) => x.done)).toBe(true);
}, 240000);
