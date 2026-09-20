// Opponent preparation for the user's next game: report + tactical plan.
import type { GameState, OpponentPrep } from './model';
import { teamProfile } from './playbook/fit';
import { SCHEMES } from './playbook/systems';
import { daysBetween } from './schedule';
import { clamp } from './mgmt/market';

type Plan = NonNullable<OpponentPrep['plan']>;
export interface OppReport { pace: number; threeRate: number; rimRate: number; star: string; scheme: string; weakness: string }

/** Pure report builder — also used by scouting.ts for 'opponent' assignments. */
export function opponentReport(s: GameState, opponentId: string): OppReport {
  const t = s.teams[opponentId];
  const roster = Object.values(s.players).filter((p) => p.teamId === opponentId && !p.retired);
  const profile = teamProfile(roster, t.minutes);
  const star = [...roster].sort((a, b) => b.ratings.ovr - a.ratings.ovr)[0];
  const candidates: [OppReport['weakness'], number][] = [
    ['weak perimeter defence', 62 - profile.perimD],
    ['poor rebounding', 62 - profile.glass],
    ['turnover prone', 62 - profile.iq],
    ['soft interior defence', 62 - profile.rimProt],
  ];
  const weakness = candidates.sort((a, b) => b[1] - a[1])[0][0];
  return {
    pace: Math.round(t.tactics.pace),
    threeRate: clamp(0.3 + (profile.spacing - 62) * 0.012, 0.1, 0.85),
    rimRate: clamp(0.4 + (profile.rim - 62) * 0.01, 0.15, 0.8),
    star: star?.id ?? '',
    scheme: SCHEMES[t.tactics.defense].name,
    weakness,
  };
}

/** Build a prep report once the next user game is within 3 days. */
export function buildPrep(s: GameState): void {
  const next = s.games
    .filter((g) => !g.result && (g.home === s.userTeamId || g.away === s.userTeamId))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return;
  const days = daysBetween(s.date, next.date);
  if (days < 0 || days > 3) return;
  if (s.prep && s.prep.gameId === next.id) return;
  const opponent = next.home === s.userTeamId ? next.away : next.home;
  s.prep = { gameId: next.id, opponent, report: opponentReport(s, opponent), plan: null, prepared: false };
}

/** Clear the prep report once its game has been played. */
export function prepDaily(s: GameState): void {
  if (!s.prep) return;
  const g = s.games.find((x) => x.id === s.prep!.gameId);
  if (g?.result) s.prep = undefined;
}

const MATCH: Record<Plan, (r: OppReport) => boolean> = {
  'contain-star': () => true,
  'take-away-three': (r) => r.threeRate >= 0.5,
  'protect-rim': (r) => r.rimRate >= 0.5,
  'force-turnovers': (r) => r.weakness === 'turnover prone',
  'run-them': (r) => r.pace <= 45,
};

function planMatches(s: GameState, plan: Plan, r: OppReport): boolean {
  if (plan === 'contain-star') return (s.players[r.star]?.ratings.ovr ?? 0) >= 80;
  return MATCH[plan](r);
}

/** User picks a plan: a real (visible) tactics tweak, plus a small familiarity nudge for a good/bad read. */
export function setPlan(s: GameState, plan: Plan): string | null {
  if (!s.prep) return 'No upcoming game to prep for';
  const team = s.teams[s.userTeamId];
  const match = planMatches(s, plan, s.prep.report);
  switch (plan) {
    case 'take-away-three': team.tactics.defense = 'switch'; break;
    case 'protect-rim': team.tactics.defense = 'drop'; break;
    case 'force-turnovers': team.tactics.defense = 'press'; break;
    case 'contain-star': team.tactics.defense = 'box1'; break;
    case 'run-them':
      team.tactics.pace = clamp(team.tactics.pace + 15, 0, 100);
      team.tactics.transition = clamp(team.tactics.transition + 10, 0, 100);
      break;
  }
  team.familiarity = clamp((team.familiarity ?? 60) + (match ? 4 : -4), 0, 100);
  s.prep.plan = plan;
  s.prep.prepared = true;
  return null;
}

/** Informational: small tactical edge for the given game if a plan was set and it reads the opponent well. */
export function prepEdge(s: GameState, gameId: number, teamId: string): number {
  if (!s.prep || s.prep.gameId !== gameId || teamId !== s.userTeamId || !s.prep.plan) return 0;
  return planMatches(s, s.prep.plan, s.prep.report) ? 3 : -2;
}
