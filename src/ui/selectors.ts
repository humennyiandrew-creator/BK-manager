// Derived read-only views over GameState for the UI. Engine stays untouched.
import type { Game, GameState, Player, TeamState } from '../engine/model';
import { standings, userGameToday, type StandingRow } from '../engine/season';
import { daysBetween } from '../engine/schedule';

export const userTeam = (s: GameState): TeamState => s.teams[s.userTeamId];

export function teamRoster(s: GameState, teamId: string): Player[] {
  return Object.values(s.players).filter((p) => p.teamId === teamId);
}

export function rotationPlayers(s: GameState, teamId: string): Player[] {
  const team = s.teams[teamId];
  return team.rotation.map((id) => s.players[id]).filter(Boolean);
}

export function topPlayers(s: GameState, teamId: string, n: number): Player[] {
  return teamRoster(s, teamId)
    .slice()
    .sort((a, b) => b.ratings.ovr - a.ratings.ovr)
    .slice(0, n);
}

export function starters(s: GameState, teamId: string): Player[] {
  return rotationPlayers(s, teamId).slice(0, 5);
}

export function rotationTop8Avg(team: TeamState, players: Record<string, Player>): number {
  const roster = Object.values(players)
    .filter((p) => p.teamId === team.id)
    .sort((a, b) => b.ratings.ovr - a.ratings.ovr)
    .slice(0, 8);
  if (!roster.length) return 0;
  return roster.reduce((sum, p) => sum + p.ratings.ovr, 0) / roster.length;
}

/** 1-5 star rating for every team, by quintile of rotation-top-8 average OVR across the league. */
export function teamStars(teams: TeamState[], players: Record<string, Player>): Record<string, number> {
  const avgs = teams.map((t) => ({ id: t.id, avg: rotationTop8Avg(t, players) }));
  const sorted = [...avgs].sort((a, b) => a.avg - b.avg);
  const out: Record<string, number> = {};
  sorted.forEach((row, i) => {
    out[row.id] = Math.min(5, Math.max(1, Math.ceil(((i + 1) / sorted.length) * 5)));
  });
  return out;
}

/** Rank (1 = best) of a team's rotation-top-8 average OVR within its own competition. */
export function teamStrengthRank(s: GameState, teamId: string): number {
  const league = s.teams[teamId].league ?? 'NBA';
  const avgs = Object.values(s.teams)
    .filter((t) => (t.league ?? 'NBA') === league)
    .map((t) => ({ id: t.id, avg: rotationTop8Avg(t, s.players) }))
    .sort((a, b) => b.avg - a.avg);
  return avgs.findIndex((r) => r.id === teamId) + 1;
}

export function seasonObjective(rank: number): string {
  if (rank <= 4) return 'Win Championship';
  if (rank <= 10) return 'Make Playoffs';
  return 'Develop Youth';
}

export function conferenceStandings(s: GameState, conf: string): StandingRow[] {
  return standings(s, conf);
}

export function userStandingRow(s: GameState): StandingRow | undefined {
  const conf = userTeam(s).conference;
  return standings(s, conf).find((r) => r.teamId === s.userTeamId);
}

/** 1-based rank of the user team within its own conference standings. */
export function conferenceRank(s: GameState): number {
  const conf = userTeam(s).conference;
  return standings(s, conf).findIndex((r) => r.teamId === s.userTeamId) + 1;
}

/** 1-based OVR rank of a player within his own team's roster. */
export function playerRankOnTeam(s: GameState, player: Player): number {
  return topPlayers(s, player.teamId!, 100).findIndex((p) => p.id === player.id) + 1;
}

/** All future (unplayed) user games, sorted by date. */
export function upcomingUserGames(s: GameState, n = 5): Game[] {
  return s.games
    .filter((g) => !g.result && (g.home === s.userTeamId || g.away === s.userTeamId) && g.date >= s.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, n);
}

export function nextUserGame(s: GameState): Game | undefined {
  return upcomingUserGames(s, 1)[0];
}

export function lastUserGame(s: GameState): Game | undefined {
  return s.games
    .filter((g) => g.result && (g.home === s.userTeamId || g.away === s.userTeamId))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function daysUntil(s: GameState, date: string): number {
  return daysBetween(s.date, date);
}

export function opponentOf(s: GameState, g: Game): TeamState {
  return s.teams[g.home === s.userTeamId ? g.away : g.home];
}

/** Most recent completed game this season between the user team and `oppId`. */
export function lastMeeting(s: GameState, oppId: string): Game | undefined {
  return s.games
    .filter((g) => g.result && ((g.home === s.userTeamId && g.away === oppId) || (g.away === s.userTeamId && g.home === oppId)))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function teamRecord(s: GameState, teamId: string): [number, number] {
  const rows = standings(s, s.teams[teamId].conference);
  const row = rows.find((r) => r.teamId === teamId);
  return row ? [row.w, row.l] : [0, 0];
}

/** Sum of a team's contracted salary for one season across the current roster. */
export function payroll(s: GameState, teamId: string, season: string): number {
  return teamRoster(s, teamId).reduce((sum, p) => {
    const line = p.contract?.salaries.find((x) => x.season === season);
    return sum + (line?.amount ?? 0);
  }, 0);
}

export interface UpcomingEvent {
  id: string;
  group: string;
  icon: 'game' | 'injury' | 'league';
  title: string;
  subtitle: string;
}

/** Home/InfoStrip "Upcoming Events": next user games, injuries returning, and phase milestones. */
export function upcomingEvents(s: GameState): { group: string; events: UpcomingEvent[] }[] {
  const groupLabel = (date: string) => {
    const d = daysUntil(s, date);
    if (d <= 0) return 'TODAY';
    return `IN ${d} DAY${d === 1 ? '' : 'S'}`;
  };

  const events: UpcomingEvent[] = [];
  for (const g of upcomingUserGames(s, 5)) {
    const opp = opponentOf(s, g);
    events.push({
      id: `g${g.id}`, group: groupLabel(g.date),
      icon: 'game', title: `${g.home === s.userTeamId ? 'vs' : '@'} ${opp.abbr}`,
      subtitle: g.date === s.date ? 'Today' : groupLabel(g.date).toLowerCase()
    });
  }
  for (const p of teamRoster(s, s.userTeamId)) {
    if (!p.injury) continue;
    const returnDate = new Date(Date.parse(s.date + 'T00:00:00Z') + p.injury.daysLeft * 86_400_000).toISOString().slice(0, 10);
    events.push({
      id: `inj${p.id}`, group: groupLabel(returnDate), icon: 'injury',
      title: `${p.firstName} ${p.lastName} returns`, subtitle: p.injury.name
    });
  }
  if (s.phase === 'regular') {
    const lastReg = s.games.filter((g) => g.type === 'regular').sort((a, b) => b.date.localeCompare(a.date))[0];
    if (lastReg) events.push({ id: 'playin', group: groupLabel(lastReg.date), icon: 'league', title: 'Play-In begins', subtitle: 'Regular season ends' });
  }

  const groups = new Map<string, UpcomingEvent[]>();
  for (const ev of events) {
    if (!groups.has(ev.group)) groups.set(ev.group, []);
    groups.get(ev.group)!.push(ev);
  }
  const order = (g: string) => (g === 'TODAY' ? 0 : Number(g.match(/\d+/)?.[0] ?? 999));
  return [...groups.entries()].sort((a, b) => order(a[0]) - order(b[0])).map(([group, evs]) => ({ group, events: evs }));
}

export { userGameToday };
