import { describe, expect, it } from 'vitest';
import players from '../../../data/nba/players.json';
import { buildRatings } from '../ratings';
import type { RawPlayer } from '../types';

describe('buildRatings', () => {
  const list = players as RawPlayer[];
  const r = buildRatings(list);
  const name = (id: string) => { const p = list.find((x) => x.id === id)!; return `${p.firstName} ${p.lastName}`; };
  const sorted = [...r.entries()].sort((a, b) => b[1].ovr - a[1].ovr);

  it('rates every player within bounds', () => {
    expect(r.size).toBe(list.length);
    for (const [, v] of r) {
      expect(v.ovr).toBeGreaterThanOrEqual(40);
      expect(v.pot).toBeGreaterThanOrEqual(v.ovr);
    }
  });

  it('prints league shape', () => {
    const top = sorted.slice(0, 25).map(([id, v]) => `${name(id)} ${v.ovr}/${v.pot} 3P${v.attrs.threePoint} BLK${v.attrs.block}`);
    const ovrs = sorted.map(([, v]) => v.ovr);
    console.log(top.join('\n'));
    console.log('median', ovrs[Math.floor(ovrs.length / 2)], 'p90', ovrs[Math.floor(ovrs.length * 0.1)], 'min', ovrs.at(-1));
  });
});
