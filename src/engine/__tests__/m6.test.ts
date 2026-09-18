import { describe, expect, it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { simToEndOfSeason } from '../season';
import { evaluateTrade, playerValue, proposeTrade } from '../trade';
import { freeAgents, offerContract, askingPrice } from '../freeagency';
import { draftUntilUser, runLottery, nextPick, aiPick } from '../draft';
import { payroll, capNumbers, marketValue } from '../cba';
import { ageOf } from '../ratings';

const LAL = '1610612747';
const fresh = () => newGame(teams as Team[], players as RawPlayer[], LAL, 11);

describe('M6 systems', () => {
  it('values and trades sensibly', () => {
    const s = fresh();
    const byName = (n: string) => Object.values(s.players).find((p) => p.lastName === n)!;
    const sga = byName('Gilgeous-Alexander');
    const luka = byName('Dončić');
    console.log('values: SGA', playerValue(s, sga).toFixed(0), 'Luka', playerValue(s, luka).toFixed(0), 'MV SGA $', (marketValue(sga, 2026) / 1e6).toFixed(1));
    // Lowball for SGA must be rejected.
    const scrub = Object.values(s.players).filter((p) => p.teamId === LAL).sort((a, b) => a.ratings.ovr - b.ratings.ovr)[0];
    const r = evaluateTrade(s, sga.teamId!, { players: [sga.id], picks: [] }, { players: [scrub.id], picks: [] });
    expect(r.accept).toBe(false);
    const res = proposeTrade(s, sga.teamId!, { players: [scrub.id], picks: [] }, { players: [sga.id], picks: [] });
    expect(res.ok).toBe(false);
    console.log('lowball:', res.text);
  });

  it('signs a free agent at the ask', () => {
    const s = fresh();
    const fa = freeAgents(s).sort((a, b) => b.ratings.ovr - a.ratings.ovr)[0];
    const ask = askingPrice(s, fa);
    // Make room if roster full.
    const err = offerContract(s, LAL, fa.id, ask.amount, ask.years);
    console.log('FA', fa.lastName, fa.ratings.ovr, 'ask', (ask.amount / 1e6).toFixed(2), ask.years, '→', err ?? 'signed', 'payroll', (payroll(s, LAL) / 1e6).toFixed(1), 'cap', capNumbers(2026).cap / 1e6);
  });

  it('runs a season with trades, progression, then lottery + draft', () => {
    const s = fresh();
    const before = new Map(Object.values(s.players).map((p) => [p.id, p.ratings.ovr]));
    simToEndOfSeason(s);
    const trades = s.transactions.filter((t) => t.kind === 'trade');
    console.log('AI trades', trades.length, trades.slice(0, 3).map((t) => t.text).join(' | '));
    console.log('offers to user', s.messages.filter((m) => m.action?.type === 'trade-offer').length, 'signings', s.transactions.filter((t) => t.kind === 'sign').length);
    const buckets: Record<string, number[]> = { '≤22': [], '23-26': [], '27-30': [], '31+': [] };
    for (const p of Object.values(s.players)) {
      if (!p.teamId || !before.has(p.id)) continue;
      const age = ageOf(p.birthDate);
      const k = age <= 22 ? '≤22' : age <= 26 ? '23-26' : age <= 30 ? '27-30' : '31+';
      buckets[k].push(p.ratings.ovr - before.get(p.id)!);
    }
    console.log('in-season OVR change by age', Object.entries(buckets).map(([k, v]) => `${k}: ${(v.reduce((x, y) => x + y, 0) / v.length).toFixed(2)}`).join(', '));
    const order = runLottery(s);
    expect(order.length).toBe(60);
    while (draftUntilUser(s)) { const p = nextPick(s)!; aiPick(s, p.id); }
    expect(s.draftClass.length).toBe(10);
    console.log(s.transactions.filter((t) => t.kind === 'draft').slice(-3).map((t) => t.text).join(' | '));
    console.log('cash', s.finance?.cash, 'board', s.board?.confidence);
  });
});
