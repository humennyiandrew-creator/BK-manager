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
