import { it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { simToEndOfSeason } from '../season';

it('form moves potential', () => {
  const s = newGame(teams as Team[], players as RawPlayer[], '1610612759', 9);
  const pot0 = new Map(Object.values(s.players).map((p) => [p.id, p.ratings.pot]));
  simToEndOfSeason(s);
  const ps = Object.values(s.players).filter((p) => p.teamId && p.season.min > 800);
  const by = [...ps].sort((a, b) => (b.form ?? 0) - (a.form ?? 0));
  const f = (p: typeof ps[0]) => `${p.lastName} ovr${p.ratings.ovr} form ${p.form} pot ${pot0.get(p.id)}→${Math.round(p.ratings.pot)}`;
  console.log('TOP', by.slice(0, 5).map(f).join(' | '));
  console.log('BOTTOM', by.slice(-5).map(f).join(' | '));
  const d = ps.map((p) => p.ratings.pot - pot0.get(p.id)!);
  console.log('mean pot change', (d.reduce((a, b) => a + b, 0) / d.length).toFixed(2), 'max', Math.max(...d).toFixed(1), 'min', Math.min(...d).toFixed(1));
}, 120000);
