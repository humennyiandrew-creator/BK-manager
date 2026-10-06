import { expect, it } from 'vitest';
import teams from '../../../data/nba/teams.json';
import players from '../../../data/nba/players.json';
import type { RawPlayer, Team } from '../types';
import { newGame } from '../world';
import { simToEndOfSeason, standings } from '../season';
import { simOffseason, expiring, resignAsk } from '../offseason';
import { payroll, rosterOf, isTwoWay, capNumbers } from '../cba';

// Yield between seasons so a minute-long sim doesn't starve vitest's worker RPC.
const breathe = () => new Promise((r) => setTimeout(r, 0));

it('plays a full 5-season career', async () => {
  const s = newGame(teams as Team[], players as RawPlayer[], '1610612738', 21);
  const t0 = Date.now();
  for (let season = 0; season < 6 && !s.careerOver; season++) {
    simToEndOfSeason(s);
    expect(s.phase).toBe('offseason');
    await breathe();
    simOffseason(s);
    await breathe();
    const sizes = Object.keys(s.teams).map((t) => rosterOf(s, t).filter((p) => !isTwoWay(p)).length);
    const pays = Object.keys(s.teams).filter((t) => t !== s.userTeamId).map((t) => payroll(s, t) / 1e6);
    const rec = s.history[s.history.length - 1];
    const aw = rec.awards;
    const nm = (id: string | null) => (id ? s.players[id].lastName : '-');
    console.log(`${rec.season}: BOS ${rec.w}-${rec.l} ${rec.result}; champ ${s.teams[rec.champion].abbr}; MVP ${nm(aw.mvp)} ROY ${nm(aw.roy)} DPOY ${nm(aw.dpoy)}` +
      (s.careerOver ? '' : ` | next ${s.season} rosters ${Math.min(...sizes)}-${Math.max(...sizes)} AI payroll ${Math.min(...pays).toFixed(0)}-${Math.max(...pays).toFixed(0)}M cap ${(capNumbers(s.seasonYear).cap / 1e6).toFixed(0)}`));
  }
  expect(s.careerOver).toBe(true);
  expect(s.history.length).toBe(5);
  const top = Object.values(s.players).filter((p) => p.teamId).sort((a, b) => b.ratings.ovr - a.ratings.ovr).slice(0, 5);
  console.log('top OVR at end:', top.map((p) => `${p.lastName} ${p.ratings.ovr}`).join(', '), 'retired', Object.values(s.players).filter((p) => p.retired).length, 'secs', ((Date.now() - t0) / 1000).toFixed(0));
  const gen = Object.values(s.players).filter((p) => p.id.startsWith('gen-') && p.teamId).sort((a, b) => b.ratings.ovr - a.ratings.ovr).slice(0, 3);
  console.log('best drafted:', gen.map((p) => `${p.lastName} ${p.ratings.ovr}/${p.ratings.pot} (${s.teams[p.teamId!].abbr})`).join(', '));
  void expiring; void resignAsk; void standings;
}, 300000);
