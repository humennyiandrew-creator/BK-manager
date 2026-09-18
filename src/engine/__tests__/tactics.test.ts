import { it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import type { Tactics } from '../model';
import { newGame } from '../world';
import { simGame } from '../sim/fast';
import { mulberry32 } from '../rng';
import { lineupProfile, offenseFit, teamProfile } from '../playbook/fit';

const s = newGame(teams as Team[], players as RawPlayer[], '1610612747', 5);
const byAbbr = (a: string) => Object.values(s.teams).find((t) => t.abbr === a)!;

function net(abbr: string, tac: Partial<Tactics>, n = 400) {
  const team = byAbbr(abbr);
  const saved = { ...team.tactics };
  Object.assign(team.tactics, tac);
  const opps = Object.values(s.teams).filter((t) => t.id !== team.id);
  let diff = 0;
  for (let i = 0; i < n; i++) {
    const o = opps[i % opps.length];
    const r = simGame(i % 2 ? team : o, i % 2 ? o : team, s.players, mulberry32(1000 + i));
    diff += i % 2 ? r.home - r.away : r.away - r.home;
  }
  team.tactics = saved;
  return (diff / n).toFixed(2);
}

it('tactics fit changes outcomes sensibly', () => {
  const paint: Partial<Tactics> = { offense: 'post', threeFocus: 15, crashGlass: 80, pace: 50 };
  const bombs: Partial<Tactics> = { offense: 'seven', threeFocus: 90, crashGlass: 25, pace: 70 };
  const neutral: Partial<Tactics> = { offense: 'motion', threeFocus: 50, crashGlass: 50, pace: 50 };
  for (const abbr of ['MIA', 'SAS', 'GSW', 'BOS']) {
    const t = byAbbr(abbr);
    const prof = teamProfile(Object.values(s.players).filter((p) => p.teamId === t.id), t.minutes);
    const fp = offenseFit(prof, { ...t.tactics, ...paint } as Tactics), fb = offenseFit(prof, { ...t.tactics, ...bombs } as Tactics);
    console.log(abbr, `spacing ${prof.spacing.toFixed(0)} rim ${prof.rim.toFixed(0)} glass ${prof.glass.toFixed(0)} | net/g neutral ${net(abbr, neutral)} paint ${net(abbr, paint)} (fit ${fp.score}) bombs ${net(abbr, bombs)} (fit ${fb.score})`);
  }
  void lineupProfile;
}, 300000);
