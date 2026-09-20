// New career: raw data → GameState.
import type { GameState, Player, TeamState } from './model';
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

export const MAX_STANDARD = 15;
export const MAX_TWO_WAY = 3;
const VET_MIN = 2_300_000;

export function newGame(teams: Team[], raw: RawPlayer[], userTeamId: string, seed: number, seasonYear = 2026): GameState {
  const ratings = buildRatings(raw);
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
    trimRoster(t.id, players);
    refreshRotation(teamStates[t.id], players);
    autoTactics(teamStates[t.id].tactics, Object.values(players).filter((p) => p.teamId === t.id));
  }

  const season = `${seasonYear}-${String((seasonYear + 1) % 100).padStart(2, '0')}`;
  const games = buildSchedule(Object.values(teamStates), seasonYear, seed, 1);
  const user = teamStates[userTeamId];
  const regularEnd = games.reduce((m, g) => (g.date > m ? g.date : m), '');
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
    scouting: { assignments: [], knowledge: {}, shortlist: [] }, promises: [],
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
