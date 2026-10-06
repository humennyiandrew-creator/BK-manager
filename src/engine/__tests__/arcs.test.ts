import { expect, it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import type { GameEvent, GameState, Player } from '../model';
import { newGame } from '../world';
import { applyArcChoice, arcEventDraft, pendingArcDecision, rollSeasonArcs, settleArc, tickArc } from '../arcs';
import { eventsDaily, pendingUserEvent } from '../events';

const fresh = (seed: number) => newGame(teams as Team[], players as RawPlayer[], '1610612759', seed);
const rostered = (s: GameState) => Object.values(s.players).filter((p) => p.teamId && !p.retired);

it('arcs are rare and bounded', () => {
  let arcs = 0, total = 0, user = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = fresh(seed);
    const ps = rostered(s);
    total += ps.length;
    for (const p of ps) {
      if (!p.arc) continue;
      arcs++;
      if (p.teamId === s.userTeamId) user++;
      const m = p.arc.magnitude;
      expect(Math.abs(m)).toBeGreaterThanOrEqual(2);
      expect(Math.abs(m)).toBeLessThanOrEqual(13);
      expect(p.arc.kind === 'breakout' ? m > 0 : m < 0).toBe(true);
      expect(p.ratings.ovr + m).toBeLessThanOrEqual(99);
    }
  }
  const rate = arcs / total;
  console.log('arc rate', (rate * 100).toFixed(1) + '%', 'user arcs over 12 seasons', user);
  expect(rate).toBeGreaterThan(0.015);
  expect(rate).toBeLessThan(0.06);
});

function withArc(s: GameState, kind: 'breakout' | 'collapse'): Player {
  const p = rostered(s).filter((x) => x.teamId === s.userTeamId).sort((a, b) => a.ratings.ovr - b.ratings.ovr)[3];
  p.arc = { season: s.season, kind, style: kind === 'breakout' ? 'shooter' : 'confidence', magnitude: kind === 'breakout' ? 7 : -6, startWeek: 2, rampWeeks: 8, applied: 0 };
  return p;
}

it('a breakout ramps in, reveals itself, and mostly sticks', () => {
  const s = fresh(3);
  const p = withArc(s, 'breakout');
  const ovr0 = p.ratings.ovr, three0 = p.ratings.attrs.threePoint;
  for (let w = 1; w <= 12; w++) tickArc(s, p, w);
  expect(p.ratings.ovr - ovr0).toBe(7);
  expect(p.ratings.attrs.threePoint).toBeGreaterThan(three0 + 8);
  expect(p.arc!.revealed).toBe(true);
  expect(s.news?.some((n) => n.playerId === p.id && n.kind === 'breakout')).toBe(true);
  expect(pendingArcDecision(s)?.id).toBe(p.id);
  eventsDaily(s);
  const ev = pendingUserEvent(s)!;
  expect(ev.type).toBe('arc-breakout');
  settleArc(s, p);
  expect(p.arc).toBeUndefined();
  expect(p.arcHistory?.at(-1)?.delta).toBe(7);
  expect(p.ratings.ovr - ovr0).toBeGreaterThanOrEqual(3);
});

it('slump decisions change the arc', () => {
  const s = fresh(4);
  const p = withArc(s, 'collapse');
  for (let w = 1; w <= 6; w++) tickArc(s, p, w);
  expect(p.arc!.applied).toBeLessThan(0);
  const draft = arcEventDraft(s, p);
  expect(draft.type).toBe('arc-slump');
  const ev = { ...draft, id: 'evT', date: s.date, teamId: s.userTeamId, expires: s.date } as GameEvent;
  const applied = p.arc!.applied;
  const out = applyArcChoice(s, ev, 'bench');
  expect(out).toMatch(/slide has stopped/);
  expect(p.arc!.locked).toBe(true);
  expect(p.arc!.magnitude).toBe(applied);
  for (let w = 7; w <= 14; w++) tickArc(s, p, w);
  expect(p.arc!.applied).toBe(applied); // frozen
});

it('rolling twice in a season is idempotent', () => {
  const s = fresh(5);
  const before = rostered(s).filter((p) => p.arc).map((p) => `${p.id}:${p.arc!.magnitude}`).sort();
  rollSeasonArcs(s);
  const after = rostered(s).filter((p) => p.arc).map((p) => `${p.id}:${p.arc!.magnitude}`).sort();
  expect(after).toEqual(before);
});
