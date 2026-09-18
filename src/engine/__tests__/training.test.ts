import { describe, expect, it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { trainingDaily } from '../training';
import { startNode, facilitiesDaily, hasNode } from '../mgmt/facilities';

const LAL = '1610612747';
const fresh = () => newGame(teams as Team[], players as RawPlayer[], LAL, 11);

describe('training', () => {
  it('rest sessions lower fatigue', () => {
    const s = fresh();
    const p = Object.values(s.players).find((x) => x.teamId === LAL)!;
    p.fatigue = 50;
    s.training[LAL].schedule = ['rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest'];
    trainingDaily(s);
    expect(p.fatigue).toBeLessThan(50);
  });

  it('high-intensity sessions raise fatigue', () => {
    const s = fresh();
    const p = Object.values(s.players).find((x) => x.teamId === LAL)!;
    p.fatigue = 50;
    s.training[LAL].schedule = ['high', 'high', 'high', 'high', 'high', 'high', 'high'];
    trainingDaily(s);
    expect(p.fatigue).toBeGreaterThan(50);
  });

  it('familiarity grows day over day', () => {
    const s = fresh();
    s.teams[LAL].familiarity = 60;
    s.training[LAL].schedule = ['light', 'light', 'light', 'light', 'light', 'light', 'light'];
    trainingDaily(s);
    expect(s.teams[LAL].familiarity!).toBeGreaterThan(60);
  });

  it('a facility node builds and completes', () => {
    const s = fresh();
    const err = startNode(s, 'training_shootingLab');
    expect(err).toBeNull();
    const fac = s.facilities[LAL].training;
    expect(fac.building?.node).toBe('training_shootingLab');
    expect(hasNode(s, LAL, 'training_shootingLab')).toBe(false);
    s.date = fac.building!.done;
    facilitiesDaily(s);
    expect(hasNode(s, LAL, 'training_shootingLab')).toBe(true);
    expect(s.facilities[LAL].training.building).toBeUndefined();
  });
});
