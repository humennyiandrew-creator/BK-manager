import { describe, expect, it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { advanceDay } from '../season';
import { pendingUserEvent } from '../events';

describe('dynamic events', () => {
  it('generates and resolves user events over 60 days, state stays valid', () => {
    const s = newGame(teams as Team[], players as RawPlayer[], '1610612747', 99);
    for (let i = 0; i < 60; i++) advanceDay(s);

    const userEvents = s.events.filter((e) => e.teamId === s.userTeamId);
    expect(userEvents.length).toBeGreaterThanOrEqual(3);

    const pendingCount = userEvents.filter((e) => !e.resolved).length;
    expect(pendingCount).toBeLessThanOrEqual(1); // only one pending user event at a time
    expect(pendingUserEvent(s)?.resolved).toBeUndefined();

    for (const e of userEvents) {
      if (e.resolved) {
        expect(typeof e.resolved.outcome).toBe('string');
        expect(e.resolved.outcome.length).toBeGreaterThan(0);
      } else {
        expect(e.choices.length).toBeGreaterThan(0);
      }
    }

    expect(s.events.length).toBeLessThanOrEqual(60);
    for (const p of Object.values(s.players)) {
      expect(p.morale).toBeGreaterThanOrEqual(0);
      expect(p.morale).toBeLessThanOrEqual(100);
    }
    expect(s.board.confidence).toBeGreaterThanOrEqual(0);
    expect(s.board.confidence).toBeLessThanOrEqual(100);
  });
});
