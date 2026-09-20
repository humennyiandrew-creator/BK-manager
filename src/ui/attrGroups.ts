import type { Attr } from '../engine/ratings';
import type { GameState } from '../engine/model';
import { hashString, mulberry32 } from '../engine/rng';

export const ATTR_GROUPS: { label: string; attrs: Attr[] }[] = [
  { label: 'Scoring', attrs: ['closeShot', 'layup', 'dunk', 'postScoring', 'midRange', 'threePoint', 'freeThrow', 'drawFoul'] },
  { label: 'Playmaking', attrs: ['ballHandle', 'passing', 'vision', 'offIQ'] },
  { label: 'Defense', attrs: ['perimeterD', 'interiorD', 'helpD', 'steal', 'block'] },
  { label: 'Rebounding', attrs: ['offRebound', 'defRebound'] },
  { label: 'Physical', attrs: ['speed', 'acceleration', 'strength', 'vertical', 'stamina', 'durability'] },
  { label: 'Mental', attrs: ['clutch'] }
];

export const ATTR_LABEL: Record<Attr, string> = {
  closeShot: 'Close Shot', layup: 'Layup', dunk: 'Dunk', postScoring: 'Post Scoring', midRange: 'Mid-Range',
  threePoint: 'Three Point', freeThrow: 'Free Throw', drawFoul: 'Draw Foul',
  ballHandle: 'Ball Handle', passing: 'Passing', vision: 'Vision', offIQ: 'Off IQ',
  perimeterD: 'Perimeter D', interiorD: 'Interior D', helpD: 'Help D', steal: 'Steal', block: 'Block',
  offRebound: 'Off Rebound', defRebound: 'Def Rebound',
  speed: 'Speed', acceleration: 'Acceleration', strength: 'Strength', vertical: 'Vertical',
  stamina: 'Stamina', durability: 'Durability', clutch: 'Clutch'
};

export function attrVariant(v: number): 'positive' | 'cyan' | 'muted' | 'negative' {
  if (v >= 80) return 'positive';
  if (v >= 65) return 'cyan';
  if (v >= 50) return 'muted';
  return 'negative';
}

/** Deterministic scouted attribute value (same noise formula used by the Draft big board). */
export function scoutAttrValue(s: GameState, pid: string, teamId: string, attr: Attr, range: number): number {
  const rng = mulberry32(hashString(`${s.seed}|scoutattr|${teamId}|${pid}|${attr}`));
  const noise = (rng() - 0.5) * 2 * range;
  const p = s.players[pid];
  return Math.max(25, Math.min(99, Math.round(p.ratings.attrs[attr] + noise)));
}
