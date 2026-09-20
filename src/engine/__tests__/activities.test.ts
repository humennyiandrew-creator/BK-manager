import { describe, expect, it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { addDays } from '../schedule';
import { scoutView } from '../draft';
import { scoutingWeekly, startAssignment } from '../scouting';
import { availablePrograms, programsWeekly, startProgram } from '../programs';
import { buildPrep, setPlan } from '../prep';

const LAL = '1610612747';
const fresh = () => newGame(teams as Team[], players as RawPlayer[], LAL, 5);

describe('scouting', () => {
  it('an assignment completes and raises knowledge, shrinking the scout view range', () => {
    const s = fresh();
    const pid = s.draftClass[10];
    const before = scoutView(s, pid, s.userTeamId);
    const err = startAssignment(s, 'player', pid, 2);
    expect(err).toBeNull();
    expect(s.scouting.assignments.length).toBe(1);

    s.date = addDays(s.date, 7);
    scoutingWeekly(s);
    expect(s.scouting.assignments.length).toBe(1); // one week left still
    s.date = addDays(s.date, 7);
    scoutingWeekly(s);

    expect(s.scouting.assignments.length).toBe(0); // completed and removed
    expect(s.scouting.knowledge[pid]).toBeGreaterThan(0);
    const after = scoutView(s, pid, s.userTeamId);
    expect(after.range).toBeLessThan(before.range);
  });
});

describe('development programmes', () => {
  it('a programme completes and changes an attribute', () => {
    const s = fresh();
    const p = Object.values(s.players).find((x) => x.teamId === LAL)!;
    const options = availablePrograms(s, p.id);
    expect(options.length).toBeGreaterThan(0);
    const option = options[0]; // skill option: target is an Attr
    const target = option.target as keyof typeof p.ratings.attrs;
    const before = p.ratings.attrs[target];

    const err = startProgram(s, p.id, option);
    expect(err).toBeNull();
    expect(p.program).toBeTruthy();

    for (let i = 0; i < option.weeks; i++) {
      s.date = addDays(s.date, 7);
      programsWeekly(s);
    }

    expect(p.program).toBeUndefined();
    expect(p.ratings.attrs[target]).not.toBe(before);
  });

  it('caps active programmes at 3 per team', () => {
    const s = fresh();
    const roster = Object.values(s.players).filter((x) => x.teamId === LAL).slice(0, 5);
    let started = 0;
    for (const p of roster) {
      const opt = availablePrograms(s, p.id)[0];
      if (!startProgram(s, p.id, opt)) started++;
    }
    expect(started).toBe(3);
  });
});

describe('opponent prep', () => {
  it('builds a report for the next game and a plan flips prepared', () => {
    const s = fresh();
    const next = s.games.filter((g) => g.home === LAL || g.away === LAL).sort((a, b) => a.date.localeCompare(b.date))[0];
    s.date = addDays(next.date, -2);

    buildPrep(s);
    expect(s.prep).toBeTruthy();
    expect(s.prep!.gameId).toBe(next.id);
    expect(s.prep!.prepared).toBe(false);

    const err = setPlan(s, 'contain-star');
    expect(err).toBeNull();
    expect(s.prep!.prepared).toBe(true);
    expect(s.prep!.plan).toBe('contain-star');
  });
});
