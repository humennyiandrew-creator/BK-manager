import { describe, expect, it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { LiveMatch } from '../sim/live';

describe('live match', () => {
  it('plays a full game with sane totals and positions', () => {
    const s = newGame(teams as Team[], players as RawPlayer[], '1610612747', 3);
    const ids = Object.keys(s.teams);
    const tot = { pts: 0, poss: 0, fga: 0, tpa: 0, fta: 0, ot: 0 };
    const N = 20;
    let outOfBounds = 0;
    for (let g = 0; g < N; g++) {
      const m = new LiveMatch(s.teams[ids[g % 30]], s.teams[ids[(g + 7) % 30]], s.players, g, 0);
      m.start();
      let guard = 0;
      while (m.state !== 'final' && guard++ < 100000) {
        if (m.state === 'timeout' || m.state === 'break') m.resume();
        m.step(0.1);
        if (guard % 50 === 0) for (const p of m.snapshot().players) if (p.x < -3 || p.x > 97 || p.y < -3 || p.y > 53) outOfBounds++;
      }
      expect(m.state).toBe('final');
      const r = m.result();
      const lines = [...r.box!.home, ...r.box!.away];
      tot.pts += r.home + r.away;
      tot.fga += lines.reduce((x, l) => x + l.fga, 0);
      tot.tpa += lines.reduce((x, l) => x + l.tpa, 0);
      tot.fta += lines.reduce((x, l) => x + l.fta, 0);
      tot.ot += r.periods.length > 4 ? 1 : 0;
      const mins = lines.reduce((x, l) => x + l.min, 0);
      expect(mins).toBeGreaterThan(470);
      if (g === 0) console.log(m.pbp.slice(0, 25).map((l) => `Q${l.period} ${l.clock.toFixed(0).padStart(3)} ${l.home}-${l.away} ${l.text}`).join('\n'));
    }
    const per = (v: number) => (v / (N * 2)).toFixed(1);
    console.log('per team: pts', per(tot.pts), 'fga', per(tot.fga), '3pa', per(tot.tpa), 'fta', per(tot.fta), 'OT games', tot.ot, 'oob', outOfBounds);
  });
});

describe('live coaching', () => {
  it('FIBA rules, intensity, team talks, win probability and shot chart', async () => {
    const { FIBA_RULES, LEAGUES } = await import('../leagues');
    const s = newGame(teams as Team[], players as RawPlayer[], '1610612747', 8);
    const ids = Object.keys(s.teams);
    const m = new LiveMatch(s.teams[ids[0]], s.teams[ids[1]], s.players, 11, 0, { ...FIBA_RULES, possSec: LEAGUES.EL.possSec });
    expect(m.maxTimeouts()).toBe(2);
    expect(m.timeouts).toEqual([2, 2]);
    m.start();
    m.setIntensity(0, 1);
    let guard = 0, talked = false, maxTo = 0;
    const wps: number[] = [];
    while (m.state !== 'final' && guard++ < 100000) {
      if (m.state === 'timeout') { if (!talked) talked = m.teamTalk(0, 'calm'); m.resume(); }
      if (m.state === 'break') m.resume();
      if (guard === 2000) m.requestTimeout(0);
      m.step(0.1);
      maxTo = Math.max(maxTo, m.timeouts[0]);
      if (guard % 400 === 0) wps.push(m.winProb());
    }
    const r = m.result();
    const mins = [...r.box!.home, ...r.box!.away].reduce((x, l) => x + l.min, 0);
    console.log('FIBA final', r.home, r.away, 'periods', r.periods.length, 'team minutes', mins.toFixed(0), 'shots', m.shots.length, 'flow', m.flow.length);
    expect(mins).toBeGreaterThan(390);
    expect(mins).toBeLessThan(470 + (r.periods.length - 4) * 50);
    expect(talked).toBe(true);
    expect(maxTo).toBeLessThanOrEqual(3);
    expect(m.shots.length).toBeGreaterThan(80);
    expect(m.shots.every((sh) => sh.x >= 0 && sh.x <= 47.5 && sh.y >= 0 && sh.y <= 50)).toBe(true);
    expect(m.shots.filter((sh) => sh.three).every((sh) => Math.hypot(sh.x - 5.25, sh.y - 25) > 21)).toBe(true);
    expect(wps.every((w) => w >= 0 && w <= 1)).toBe(true);
    expect(m.winProb()).toBe(r.home > r.away ? 1 : 0);
  });
});
