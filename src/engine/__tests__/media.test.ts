import { describe, expect, it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { advanceDay } from '../season';
import { answerPress } from '../media';
import { makePromise, checkPromises } from '../mgmt/board';
import { signSponsor, sponsorOffers } from '../sponsors';
import { staffCourses, enrollStaff, staffWeekly } from '../mgmt/staff';

describe('press conferences', () => {
  it('builds questions and answering changes morale/confidence/hype', () => {
    const s = newGame(teams as Team[], players as RawPlayer[], '1610612747', 7);
    let guard = 0;
    while (!s.press?.pending && guard < 40) { advanceDay(s); guard++; }
    expect(s.press?.pending).toBeTruthy();

    const pending = s.press!.pending!;
    expect(pending.questions.length).toBeGreaterThanOrEqual(2);

    const before = { hype: s.finance.hype ?? 50, confidence: s.board.confidence };
    const q = pending.questions[0];
    const choice = q.choices[0];
    const outcome = answerPress(s, q.id, choice.id);
    expect(typeof outcome).toBe('string');
    expect(outcome.length).toBeGreaterThan(0);

    const changed = (s.finance.hype ?? 50) !== before.hype || s.board.confidence !== before.confidence
      || Object.values(s.players).some((p) => p.teamId === s.userTeamId);
    expect(changed).toBe(true);
    expect(s.finance.hype).toBeGreaterThanOrEqual(0);
    expect(s.finance.hype).toBeLessThanOrEqual(100);
    expect(s.board.confidence).toBeGreaterThanOrEqual(0);
    expect(s.board.confidence).toBeLessThanOrEqual(100);
  });
});

describe('board promises', () => {
  it('a wins promise is kept once the win target is reached', () => {
    const s = newGame(teams as Team[], players as RawPlayer[], '1610612747', 11);
    const promise = makePromise(s, 'wins', 0);
    expect(promise.status).toBe('open');
    checkPromises(s);
    expect(s.promises.find((p) => p.id === promise.id)?.status).toBe('kept');
  });

  it('a promise breaks once its deadline passes unmet', () => {
    const s = newGame(teams as Team[], players as RawPlayer[], '1610612747', 12);
    const promise = makePromise(s, 'wins', 999);
    promise.deadline = s.date;
    checkPromises(s);
    expect(s.promises.find((p) => p.id === promise.id)?.status).toBe('broken');
  });
});

describe('sponsors', () => {
  it('signing a sponsor deal pays income into revenue.sponsors', () => {
    const s = newGame(teams as Team[], players as RawPlayer[], '1610612747', 13);
    s.finance.hype = 100;
    const offers = sponsorOffers(s);
    expect(offers.length).toBeGreaterThan(0);
    const offer = offers[0];
    const err = signSponsor(s, offer.id);
    expect(err).toBeNull();
    expect(s.finance.sponsors?.length).toBe(1);

    const before = s.finance.revenue.sponsors;
    s.phase = 'regular';
    for (let i = 0; i < 10; i++) advanceDay(s);
    expect(s.finance.revenue.sponsors).toBeGreaterThan(before);
  });
});

describe('staff development', () => {
  it('a completed course raises the staffer rating', () => {
    const s = newGame(teams as Team[], players as RawPlayer[], '1610612747', 14);
    const st = s.staff.find((x) => x.teamId === s.userTeamId)!;
    const before = st.rating;
    const [course] = staffCourses(s, st.id);
    s.finance.cash = 1_000_000_000;
    const err = enrollStaff(s, st.id, course);
    expect(err).toBeNull();
    expect(st.course).toBeTruthy();

    for (let i = 0; i < (course.weeks + 1) * 7; i++) {
      s.date = new Date(new Date(s.date + 'T00:00:00Z').getTime() + 86_400_000).toISOString().slice(0, 10);
      staffWeekly(s);
    }
    expect(st.course).toBeUndefined();
    expect(st.rating).toBeGreaterThanOrEqual(before);
  });
});
