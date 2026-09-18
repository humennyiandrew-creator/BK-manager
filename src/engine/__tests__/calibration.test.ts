import { describe, expect, it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { simToEndOfSeason, standings } from '../season';
import { emptyLine } from '../model';

// 2025-26 NBA per-team-game averages (approx).
const TARGET = { pts: 115.5, fga: 89, fgPct: 0.472, tpa: 37.5, tpPct: 0.36, fta: 21.5, ftPct: 0.785, orb: 11, drb: 33, ast: 26.5, tov: 14, stl: 8.2, blk: 5, pf: 19, pace: 99.5 };

describe('full season', () => {
  const s = newGame(teams as Team[], players as RawPlayer[], '1610612747', 42);
  const t0 = Date.now();
  simToEndOfSeason(s);
  const ms = Date.now() - t0;

  it('schedule is balanced', () => {
    for (const t of Object.values(s.teams)) {
      const g = s.games.filter((x) => x.type === 'regular' && (x.home === t.id || x.away === t.id));
      expect(g.length).toBe(82);
      expect(g.filter((x) => x.home === t.id).length).toBe(41);
    }
  });

  it('reaches a champion', () => {
    expect(s.champion).toBeTruthy();
    expect(s.phase).toBe('offseason');
  });

  it('prints league averages vs target', () => {
    const tot = emptyLine();
    for (const p of Object.values(s.players)) for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += p.season[k];
    const n = 1230 * 2;
    const per = (v: number) => +(v / n).toFixed(1);
    const got = {
      pts: per(tot.pts), fga: per(tot.fga), fgPct: +(tot.fgm / tot.fga).toFixed(3), tpa: per(tot.tpa), tpPct: +(tot.tpm / tot.tpa).toFixed(3),
      fta: per(tot.fta), ftPct: +(tot.ftm / tot.fta).toFixed(3), orb: per(tot.orb), drb: per(tot.drb), ast: per(tot.ast), tov: per(tot.tov),
      stl: per(tot.stl), blk: per(tot.blk), pf: per(tot.pf), pace: per(tot.fga + 0.44 * tot.fta - tot.orb + tot.tov),
    };
    console.log('ms', ms);
    for (const k of Object.keys(TARGET) as (keyof typeof TARGET)[]) console.log(k.padEnd(6), String(got[k]).padStart(7), String(TARGET[k]).padStart(7));
    const ot = s.games.filter((g) => g.result && g.result.periods.length > 4).length;
    console.log('OT games', ot);
    const tab = (c: 'East' | 'West') => standings(s, c).map((r) => `${s.teams[r.teamId].abbr} ${r.w}-${r.l}`).join(', ');
    console.log('East:', tab('East')); console.log('West:', tab('West'));
    console.log('Champion', s.teams[s.champion!].abbr);
    const lead = Object.values(s.players).filter((p) => p.season.gp >= 50).sort((a, b) => b.season.pts / b.season.gp - a.season.pts / a.season.gp).slice(0, 10);
    console.log(lead.map((p) => `${p.lastName} ${(p.season.pts / p.season.gp).toFixed(1)}p ${(p.season.min / p.season.gp).toFixed(1)}m ${p.season.gp}g`).join(' | '));
  });
});

describe('team strength', () => {
  it('correlates roster OVR with wins', () => {
    const s = newGame(teams as Team[], players as RawPlayer[], '1610612747', 7);
    const str = new Map(Object.values(s.teams).map((t) => [t.id, t.rotation.slice(0, 8).reduce((x, id) => x + s.players[id].ratings.ovr, 0) / 8]));
    simToEndOfSeason(s);
    const rows = standings(s).map((r) => [str.get(r.teamId)!, r.w] as const);
    const m = (i: 0 | 1) => rows.reduce((x, r) => x + r[i], 0) / rows.length;
    const [mx, my] = [m(0), m(1)];
    const cov = rows.reduce((x, r) => x + (r[0] - mx) * (r[1] - my), 0);
    const sd = (i: 0 | 1, mu: number) => Math.sqrt(rows.reduce((x, r) => x + (r[i] - mu) ** 2, 0));
    const w = rows.map((r) => r[1]);
    console.log('corr', (cov / (sd(0, mx) * sd(1, my))).toFixed(2), 'wins max/min', Math.max(...w), Math.min(...w));
  });
});
