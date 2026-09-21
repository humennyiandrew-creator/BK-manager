// New career: raw data → GameState.
import type { Game, GameState, Player, TeamState } from './model';
import { emptyLine } from './model';
import { buildRatings } from './ratings';
import { refreshRotation } from './rotation';
import { buildSchedule } from './schedule';
import { autoTactics, defaultTactics } from './playbook/systems';
import type { RawPlayer, Team } from './types';
import { initStaff } from './mgmt/staff';
import { initFacilities } from './mgmt/facilities';
import { initFinances } from './mgmt/finance';
import { initBoard } from './mgmt/board';
import { defaultTraining } from './progression';
import { initPicks } from './draft';
import { LEAGUES, leagueOf, type LeagueId } from './leagues';
import { buildRoundRobin } from './schedule';
import { euroSalary } from './euro';
import { genPlayer } from './gen';
import { hashString, mulberry32 } from './rng';

export const MAX_STANDARD = 15;
export const MAX_TWO_WAY = 3;
const VET_MIN = 2_300_000;

export function newGame(teams: Team[], raw: RawPlayer[], userTeamId: string, seed: number, seasonYear = 2026): GameState {
  // Ratings are z-scored inside each league's own pool, then shifted onto the NBA scale.
  const leagueIds = [...new Set(teams.map((t) => (t.league ?? 'NBA') as LeagueId))];
  const ratings = new Map<string, ReturnType<typeof buildRatings> extends Map<string, infer V> ? V : never>();
  for (const lg of leagueIds) {
    const ids = new Set(teams.filter((t) => (t.league ?? 'NBA') === lg).map((t) => t.id));
    const pool = raw.filter((r) => (r.teamId ? ids.has(r.teamId) : lg === 'NBA'));
    if (!pool.length) continue;
    const offset = LEAGUES[lg]?.strength ?? 0;
    for (const [id, v] of buildRatings(pool)) {
      if (offset) {
        v.ovr = Math.max(35, Math.round(v.ovr + offset));
        v.pot = Math.max(v.ovr, Math.round(v.pot + offset));
      }
      ratings.set(id, v);
    }
  }
  const players: Record<string, Player> = {};
  for (const r of raw) {
    players[r.id] = {
      id: r.id, firstName: r.firstName, lastName: r.lastName, teamId: r.teamId, jersey: r.jersey,
      positions: r.positions, heightCm: r.heightCm, weightKg: r.weightKg, birthDate: r.birthDate, country: r.country,
      draft: r.draft, yearsPro: r.yearsPro, face: r.face, ratings: ratings.get(r.id)!, contract: r.contract,
      history: r.stats, season: emptyLine(), playoffs: emptyLine(), injury: null, morale: 70,
    };
  }

  const teamStates: Record<string, TeamState> = {};
  for (const t of teams) {
    teamStates[t.id] = { ...t, rotation: [], minutes: {}, tactics: defaultTactics() };
    if ((t.league ?? 'NBA') === 'NBA') trimRoster(t.id, players);
    else {
      fillRoster(t, players, seasonYear, seed, ratings);
      trimEuroSquad(t, players);
      euroContracts(t.id, players, seasonYear);
    }
    refreshRotation(teamStates[t.id], players);
    autoTactics(teamStates[t.id].tactics, Object.values(players).filter((p) => p.teamId === t.id));
  }

  const season = `${seasonYear}-${String((seasonYear + 1) % 100).padStart(2, '0')}`;
  const all = Object.values(teamStates);
  const games: Game[] = [];
  for (const lg of leagueIds) {
    const list = all.filter((t) => (t.league ?? 'NBA') === lg);
    if (list.length < 4) continue;
    const def = leagueOf(lg);
    if (lg === 'NBA') games.push(...buildSchedule(list, seasonYear, seed, games.length + 1));
    else games.push(...buildRoundRobin(list, lg, `${seasonYear}-${String(def.start.month).padStart(2, '0')}-${String(def.start.day).padStart(2, '0')}`, def.gameDays, seed, games.length + 10_001));
  }
  const user = teamStates[userTeamId];
  const userComp = teamStates[userTeamId].league ?? 'NBA';
  const regularEnd = games.filter((g) => (g.comp ?? 'NBA') === userComp).reduce((m, g) => (g.date > m ? g.date : m), '');
  const s: GameState = {
    version: 1, seed, season, seasonYear, date: `${seasonYear}-10-01`, phase: 'preseason', userTeamId,
    teams: teamStates, players, games, series: [],
    messages: [{
      id: 1, date: `${seasonYear}-10-01`, from: 'Board of Directors', kind: 'board', read: false,
      subject: `Welcome to the ${user.city} ${user.name}`,
      body: `The board welcomes you as head coach for the ${season} season. Opening night is ${games.find((g) => g.home === userTeamId || g.away === userTeamId)?.date}.`,
    }],
    nextId: games.length + 2,
    staff: [], facilities: {}, finance: undefined as unknown as GameState['finance'], board: undefined as unknown as GameState['board'],
    training: Object.fromEntries(teams.map((t) => [t.id, defaultTraining()])),
    picks: [], tradeOffers: [], transactions: [], draftClass: [], draftOrder: [],
    startYear: seasonYear, maxSeasons: 5, history: [], events: [], negotiations: [],
    scouting: { assignments: [], knowledge: {}, shortlist: [] }, promises: [], bids: [],
    manager: { name: 'Head Coach', reputation: 45, unemployed: false, hiredOn: `${seasonYear}-10-01`, salary: 2_500_000, contractYears: 3, hotSeat: 20, offers: [], history: [] },
    keyDates: { tradeDeadline: `${seasonYear + 1}-02-05`, regularEnd, draft: `${seasonYear + 1}-06-24`, freeAgency: `${seasonYear + 1}-06-30` },
  };
  initStaff(s);
  initFacilities(s);
  initFinances(s);
  initBoard(s);
  initPicks(s);
  return s;
}

/** Preseason camp rosters run 16–25. Keep 15 standard + 3 two-way, cut the rest to free agency. */
function trimRoster(teamId: string, players: Record<string, Player>) {
  const roster = Object.values(players).filter((p) => p.teamId === teamId);
  const salary = (p: Player) => p.contract?.salaries[0]?.amount ?? 0;
  const keepScore = (p: Player) => p.ratings.ovr + (salary(p) >= 5_000_000 ? 20 : salary(p) >= VET_MIN ? 6 : 0);
  const twoWay = roster.filter((p) => p.contract?.type === 'two-way').sort((a, b) => b.ratings.ovr - a.ratings.ovr);
  const standard = roster.filter((p) => p.contract?.type !== 'two-way').sort((a, b) => keepScore(b) - keepScore(a));
  const keep = new Set([...standard.slice(0, MAX_STANDARD), ...twoWay.slice(0, MAX_TWO_WAY)]);
  for (const p of roster) {
    if (!keep.has(p)) { p.teamId = null; continue; }
    if (!p.contract) p.contract = { salaries: [{ season: '2026-27', amount: VET_MIN }], type: 'min' };
  }
}


/** EuroLeague clubs pay in a much smaller market: wages scale with rating, not the NBA cap. */
function euroContracts(teamId: string, players: Record<string, Player>, seasonYear: number) {
  for (const p of Object.values(players)) {
    if (p.teamId !== teamId || p.contract) continue;
    p.contract = euroSalary(p, seasonYear);
  }
}


/** Feeds sometimes publish a club's roster late: top it up with plausible locals so the league still plays. */
function fillRoster(t: Team, players: Record<string, Player>, seasonYear: number, seed: number, ratings: Map<string, Player['ratings']>) {
  const have = Object.values(players).filter((p) => p.teamId === t.id);
  const need = 12 - have.length;
  if (need <= 0) return;
  const rng = mulberry32(hashString(`${seed}|fill|${t.id}`));
  for (let i = 0; i < need; i++) {
    const id = `fill-${t.abbr}-${i}`;
    const ovr = Math.round(58 + rng() * 14);
    const age = 20 + Math.floor(rng() * 14);
    const p = genPlayer({ id, ovr, pot: Math.min(92, ovr + Math.round(Math.max(0, 26 - age) * 1.6)), age, asOf: `${seasonYear}-10-01`, rng });
    p.teamId = t.id;
    p.prospect = false;
    p.country = t.country ?? p.country;
    players[id] = p;
    ratings.set(id, p.ratings);
  }
}


/** European squads register up to 16; clubs keep a free slot for transfer business. */
function trimEuroSquad(t: Team, players: Record<string, Player>) {
  const limit = leagueOf(t.league).maxRoster - 1;
  const squad = Object.values(players).filter((p) => p.teamId === t.id).sort((a, b) => b.ratings.ovr - a.ratings.ovr);
  for (const p of squad.slice(limit)) p.teamId = null;
}
