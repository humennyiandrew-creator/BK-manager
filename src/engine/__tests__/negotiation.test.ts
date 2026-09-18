import { describe, expect, it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { freeAgents, releasePlayer } from '../freeagency';
import { rosterOf } from '../cba';
import { startNegotiation, makeOffer } from '../negotiation';

function game(seed = 7) {
  return newGame(teams as Team[], players as RawPlayer[], '1610612738', seed);
}

describe('negotiations', () => {
  it('rejects a lowball offer and drops the agent\'s patience', () => {
    const s = game();
    const fa = [...freeAgents(s)].sort((a, b) => a.ratings.ovr - b.ratings.ovr)[0];
    const neg = startNegotiation(s, fa.id, 'fa');
    const startPatience = neg.patience;
    const res = makeOffer(s, neg.id, { amount: Math.round(neg.floor * 0.4), years: 1 });
    expect(res.type === 'reject' || res.type === 'walk').toBe(true);
    expect(neg.patience).toBeLessThan(startPatience);
  });

  it('accepts an offer that meets the asking price and signs the player', () => {
    const s = game();
    const worst = [...rosterOf(s, s.userTeamId)].sort((a, b) => a.ratings.ovr - b.ratings.ovr)[0];
    releasePlayer(s, worst.id); // open a roster slot so the signing is legal
    const fa = [...freeAgents(s)].sort((a, b) => a.ratings.ovr - b.ratings.ovr)[0];
    const neg = startNegotiation(s, fa.id, 'fa');
    const res = makeOffer(s, neg.id, { amount: neg.ask.amount, years: neg.ask.years });
    expect(res.type).toBe('accept');
    expect(neg.status).toBe('signed');
    expect(s.players[fa.id].teamId).toBe(s.userTeamId);
  });

  it('walks away after a streak of insulting offers', () => {
    const s = game();
    const fa = [...freeAgents(s)].sort((a, b) => a.ratings.ovr - b.ratings.ovr)[1];
    const neg = startNegotiation(s, fa.id, 'fa');
    let res;
    for (let i = 0; i < 6 && neg.status === 'open'; i++) {
      res = makeOffer(s, neg.id, { amount: 1, years: 1 });
    }
    expect(neg.status).toBe('walked');
    expect(res!.type).toBe('walk');
    // fa window: re-negotiating returns the same walked negotiation rather than starting a fresh one.
    const again = startNegotiation(s, fa.id, 'fa');
    expect(again.id).toBe(neg.id);
  });

  it('extension appends contract rows for a player with one season left', () => {
    const s = game();
    const roster = rosterOf(s, s.userTeamId);
    const p = roster[0];
    p.contract = { salaries: [{ season: s.season, amount: 8_000_000 }], type: 'standard' };
    const before = p.contract.salaries.length;
    const neg = startNegotiation(s, p.id, 'extension');
    const res = makeOffer(s, neg.id, { amount: neg.ask.amount, years: neg.ask.years });
    expect(res.type).toBe('accept');
    expect(p.contract.salaries.length).toBeGreaterThan(before);
    expect(p.contract.salaries.some((x) => x.season > s.season)).toBe(true);
  });
});
