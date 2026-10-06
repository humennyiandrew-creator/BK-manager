// Opponent preparation for the user's next game: report + tactical plan.
import type { GameState, OpponentPrep, PlanId } from './model';
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
  for (const t of Object.values(s.teams)) if (t.gamePlan && t.gamePlan.gameId !== next.id) t.gamePlan = undefined;
  s.prep = { gameId: next.id, opponent, report: opponentReport(s, opponent), plan: null, prepared: false };
  // The other bench prepares too: they scout us and pick the plan that reads us best.
  const us = opponentReport(s, s.userTeamId);
  const theirs: PlanId = (s.players[us.star]?.ratings.ovr ?? 0) >= 82 ? 'contain-star' : us.threeRate >= 0.5 ? 'take-away-three' : us.rimRate >= 0.5 ? 'protect-rim' : 'force-turnovers';
  s.prep.theirPlan = theirs;
  s.teams[opponent].gamePlan = { opponent: s.userTeamId, plan: theirs, good: planMatches(s, theirs, us), star: us.star, gameId: next.id };
}

/** Clear the prep report once its game has been played. */
export function prepDaily(s: GameState): void {
  if (!s.prep) return;
  const g = s.games.find((x) => x.id === s.prep!.gameId);
  if (g?.result) {
    for (const t of Object.values(s.teams)) if (t.gamePlan?.gameId === g.id) t.gamePlan = undefined;
    s.prep = undefined;
  }
}

const MATCH: Record<Plan, (r: OppReport) => boolean> = {
  'contain-star': () => true,
  'take-away-three': (r) => r.threeRate >= 0.5,
  'protect-rim': (r) => r.rimRate >= 0.5,
  'force-turnovers': (r) => r.weakness === 'turnover prone',
  'run-them': (r) => r.pace <= 45,
};

export function planMatches(s: GameState, plan: Plan, r: OppReport): boolean {
  if (plan === 'contain-star') return (s.players[r.star]?.ratings.ovr ?? 0) >= 80;
  return MATCH[plan](r);
}

/** What each plan does on the night (applied by the game sim on top of your defensive scheme). */
export const PLAN_EFFECT: Record<Plan, string> = {
  'contain-star': 'Their best player shoots less and worse; his teammates get slightly better looks.',
  'take-away-three': 'Fewer and harder threes for them; a little more room at the rim.',
  'protect-rim': 'Fewer and harder shots at the rim for them; a little more room from three.',
  'force-turnovers': 'More turnovers for them, and a few more fouls for us.',
  'run-them': 'More fast breaks for us, at a small cost in turnovers.',
};

/** User picks a plan for the next game. A good read of the opponent works in full; a poor one only half as well. */
export function setPlan(s: GameState, plan: Plan): string | null {
  if (!s.prep) return 'No upcoming game to prep for';
  const team = s.teams[s.userTeamId];
  const good = planMatches(s, plan, s.prep.report);
  team.gamePlan = { opponent: s.prep.opponent, plan, good, star: s.prep.report.star, gameId: s.prep.gameId };
  team.familiarity = clamp((team.familiarity ?? 60) + (good ? 2 : 0), 0, 100);
  s.prep.plan = plan;
  s.prep.prepared = true;
  return null;
}

/** Whether the chosen plan reads the opponent correctly (for the UI). */
export const planIsGoodRead = (s: GameState, plan: Plan) => !!s.prep && planMatches(s, plan, s.prep.report);
