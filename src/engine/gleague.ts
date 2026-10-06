// G League: every NBA club has an affiliate. Young players can be sent down for minutes and
// development; the affiliate also carries unsigned prospects and journeymen the club can call up.
import type { GameState, Player } from './model';
import { gauss, hashString, mulberry32, type Rng } from './rng';
import { ageOf } from './ratings';
import { genPlayer } from './gen';
import { isTwoWay, rosterOf } from './cba';
import { leagueOf } from './leagues';
import { refreshRotation } from './rotation';

/** Real affiliates by parent club. */
const AFFILIATES: Record<string, string> = {
  ATL: 'College Park Skyhawks', BOS: 'Maine Celtics', BKN: 'Long Island Nets', CHA: 'Greensboro Swarm', CHI: 'Windy City Bulls',
  CLE: 'Cleveland Charge', DAL: 'Texas Legends', DEN: 'Grand Rapids Gold', DET: 'Motor City Cruise', GSW: 'Santa Cruz Warriors',
  HOU: 'Rio Grande Valley Vipers', IND: 'Noblesville Boom', LAC: 'San Diego Clippers', LAL: 'South Bay Lakers', MEM: 'Memphis Hustle',
  MIA: 'Sioux Falls Skyforce', MIL: 'Wisconsin Herd', MIN: 'Iowa Wolves', NOP: 'Birmingham Squadron', NYK: 'Westchester Knicks',
  OKC: 'Oklahoma City Blue', ORL: 'Osceola Magic', PHI: 'Delaware Blue Coats', PHX: 'Valley Suns', POR: 'Rip City Remix',
  SAC: 'Stockton Kings', SAS: 'Austin Spurs', TOR: 'Raptors 905', UTA: 'Salt Lake City Stars', WAS: 'Capital City Go-Go',
};

export const hasAffiliate = (s: GameState, teamId: string) => leagueOf(s.teams[teamId]?.league).id === 'NBA';
export const affiliateName = (s: GameState, teamId: string) => AFFILIATES[s.teams[teamId]?.abbr] ?? `${s.teams[teamId]?.city} G League`;

/** Rookie-scale years only (real rule: up to three seasons of service), or any two-way player. */
export function canAssign(s: GameState, p: Player): boolean {
  return !!p.teamId && hasAffiliate(s, p.teamId) && !p.assigned && (p.yearsPro <= 3 || isTwoWay(p));
}

export function assign(s: GameState, pid: string): string | null {
  const p = s.players[pid];
  if (!p || !canAssign(s, p)) return 'Only players in their first three seasons (or on two-way deals) can be sent down';
  p.assigned = true;
  if (p.ratings.ovr >= 74 && p.teamId === s.userTeamId) p.morale = Math.max(0, p.morale - 6); // feels he belongs up top
  refreshRotation(s.teams[p.teamId!], s.players);
  return null;
}

export function recall(s: GameState, pid: string): string | null {
  const p = s.players[pid];
  if (!p?.assigned) return 'He is not on assignment';
  p.assigned = false;
  refreshRotation(s.teams[p.teamId!], s.players);
  return null;
}

/** Players on assignment plus the affiliate's own unsigned players, best first. */
export function affiliateRoster(s: GameState, teamId: string): Player[] {
  return Object.values(s.players)
    .filter((p) => !p.retired && ((p.teamId === teamId && p.assigned) || (!p.teamId && p.affiliate === teamId)))
    .sort((a, b) => b.ratings.ovr - a.ratings.ovr);
}

const GL_MIN = [34, 32, 30, 28, 26, 22, 18, 14, 10, 6];

/** One G League game per affiliate: minutes by role, production from rating. */
function playWeek(s: GameState, teamId: string, rng: Rng) {
  const roster = affiliateRoster(s, teamId).filter((p) => !p.injury).slice(0, 10);
  const games = rng() < 0.5 ? 1 : 2;
  roster.forEach((p, i) => {
    const line = p.gl?.season === s.season ? p.gl : (p.gl = { season: s.season, gp: 0, min: 0, pts: 0, reb: 0, ast: 0 });
    const big = p.positions[0] === 'C' || p.positions[0] === 'PF';
    for (let g = 0; g < games; g++) {
      const min = Math.max(4, GL_MIN[i] + gauss(rng) * 3);
      const scale = min / 36;
      const quality = 1 + (p.ratings.ovr - 62) * 0.045; // G League stars put up big numbers
      line.gp++; line.min += min;
      line.pts += Math.max(0, Math.round((14 * quality + gauss(rng) * 5) * scale));
      line.reb += Math.max(0, Math.round(((big ? 10 : 5) * quality + gauss(rng) * 2) * scale));
      line.ast += Math.max(0, Math.round(((p.positions[0] === 'PG' ? 7 : 2.5) * quality + gauss(rng) * 1.5) * scale));
    }
  });
}

/** AI clubs send down young depth and bring players back when injuries thin the rotation. */
function aiManage(s: GameState, teamId: string) {
  const roster = rosterOf(s, teamId);
  const healthyUp = () => roster.filter((p) => !p.injury && !p.assigned).length;
  for (const p of roster.filter((x) => x.assigned).sort((a, b) => b.ratings.ovr - a.ratings.ovr)) {
    if (healthyUp() >= 11) break;
    recall(s, p.id);
  }
  const team = s.teams[teamId];
  const depth = team.rotation.slice(10).map((id) => s.players[id]).filter(Boolean);
  for (const p of depth) {
    if (healthyUp() <= 11) break;
    if (canAssign(s, p) && ageOf(p.birthDate, new Date(s.date)) <= 24) assign(s, p.id);
  }
}

/** Monday tick during the season: affiliates play, AI clubs shuffle assignments. */
export function gleagueWeekly(s: GameState) {
  if (s.phase !== 'regular' || new Date(`${s.date}T00:00:00Z`).getUTCDay() !== 1) return;
  const rng = mulberry32(hashString(`${s.seed}|gleague|${s.date}`));
  for (const t of Object.values(s.teams)) {
    if (!hasAffiliate(s, t.id)) continue;
    if (t.id !== s.userTeamId) aiManage(s, t.id);
    playWeek(s, t.id, rng);
  }
}

/** Summer: everyone comes back up, and each affiliate re-stocks to eight unsigned players. */
export function gleagueOffseason(s: GameState) {
  const rng = mulberry32(hashString(`${s.seed}|gleague-summer|${s.season}`));
  for (const p of Object.values(s.players)) if (p.assigned) p.assigned = false;
  const parents = Object.values(s.teams).filter((t) => hasAffiliate(s, t.id)).map((t) => t.id);
  // Undrafted young free agents land with an affiliate first.
  const undrafted = Object.values(s.players)
    .filter((p) => !p.teamId && !p.retired && !p.prospect && !p.affiliate && ageOf(p.birthDate, new Date(s.date)) <= 24)
    .sort((a, b) => b.ratings.pot - a.ratings.pot);
  let k = Math.floor(rng() * parents.length);
  for (const p of undrafted) {
    const parent = parents[k++ % parents.length];
    if (affiliateRoster(s, parent).filter((x) => !x.teamId).length >= 8) continue;
    p.affiliate = parent;
  }
  for (const parent of parents) {
    let have = affiliateRoster(s, parent).filter((x) => !x.teamId).length;
    for (let i = 0; have < 8; i++, have++) {
      const ovr = Math.round(57 + rng() * 10);
      const age = 22 + Math.floor(rng() * 7);
      const id = `gl-${s.season}-${s.teams[parent].abbr}-${i}`;
      const p = genPlayer({ id, ovr, pot: Math.min(80, ovr + Math.round(Math.max(0, 26 - age) * 1.4 + rng() * 3)), age, asOf: `${s.seasonYear}-10-01`, rng });
      p.prospect = false;
      p.yearsPro = Math.max(0, age - 22);
      p.affiliate = parent;
      s.players[id] = p;
    }
  }
}

export const gleagueLine = (p: Player, season: string) => (p.gl?.season === season && p.gl.gp ? p.gl : null);
