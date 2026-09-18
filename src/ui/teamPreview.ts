// Pre-save team browsing (ChooseTeamScreen): cheap previews from raw data, no GameState yet.
import { buildRatings } from '../engine/ratings';
import type { RawPlayer, Team } from '../engine/types';

export interface TeamPreviewPlayer {
  id: string;
  firstName: string;
  lastName: string;
  ovr: number;
}

export interface TeamPreview {
  team: Team;
  topPlayers: TeamPreviewPlayer[];
  avgOvr: number;
  stars: number;
}

export function buildTeamPreviews(teams: Team[], players: RawPlayer[]): TeamPreview[] {
  const ratings = buildRatings(players);
  const byTeam = new Map<string, RawPlayer[]>();
  for (const p of players) {
    if (!p.teamId) continue;
    if (!byTeam.has(p.teamId)) byTeam.set(p.teamId, []);
    byTeam.get(p.teamId)!.push(p);
  }
  const rows = teams.map((team) => {
    const roster = (byTeam.get(team.id) ?? [])
      .map((p) => ({ p, ovr: ratings.get(p.id)?.ovr ?? 0 }))
      .sort((a, b) => b.ovr - a.ovr);
    const top8 = roster.slice(0, 8);
    const avgOvr = top8.length ? top8.reduce((sum, r) => sum + r.ovr, 0) / top8.length : 0;
    const topPlayers = roster.slice(0, 3).map((r) => ({ id: r.p.id, firstName: r.p.firstName, lastName: r.p.lastName, ovr: r.ovr }));
    return { team, topPlayers, avgOvr, stars: 1 };
  });
  const sorted = [...rows].sort((a, b) => a.avgOvr - b.avgOvr);
  sorted.forEach((row, i) => {
    row.stars = Math.min(5, Math.max(1, Math.ceil(((i + 1) / sorted.length) * 5)));
  });
  return rows;
}
