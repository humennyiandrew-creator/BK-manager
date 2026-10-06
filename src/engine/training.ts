// Weekly training schedule: session effects, daily fatigue/familiarity ticks, tactic-change familiarity reset.
import { hasSpec } from './mgmt/staff';
import type { GameState, Session, TeamState } from './model';
import { addDays } from './schedule';
import { clamp } from './mgmt/market';
import { hasNode } from './mgmt/facilities';

export const DEFAULT_SCHEDULE: Session[] = ['high', 'light', 'rest', 'high', 'film', 'light', 'rest'];

interface SessionEffect { growth: number; fatigue: number; familiarity: number; injury: number }

/** Growth is a multiplier around 1.0 (default-schedule weekly avg ≈0.95); light is exactly 0.6× high per spec. */
export const SESSION_EFFECTS: Record<Session, SessionEffect> = {
  high: { growth: 1.8, fatigue: 12, familiarity: 3, injury: 1.2 },
  light: { growth: 1.08, fatigue: 5, familiarity: 2, injury: 0.95 },
  shootaround: { growth: 0.5, fatigue: 2, familiarity: 1, injury: 0.9 },
  film: { growth: 0.6, fatigue: 1, familiarity: 4, injury: 0.8 },
  rest: { growth: 0.15, fatigue: -20, familiarity: 0, injury: 0.6 },
};

const NATURAL_RECOVERY = 6; // fatigue points recovered per day regardless of session

function weekday(date: string): number { // 0=Mon..6=Sun
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function weekStart(date: string): string {
  return addDays(date, -weekday(date));
}

function planSchedule(s: GameState, teamId: string): Session[] {
  const sched = s.training[teamId]?.schedule;
  return sched && sched.length === 7 ? sched : DEFAULT_SCHEDULE;
}

function teamHasGame(s: GameState, teamId: string, date: string): boolean {
  return s.games.some((g) => g.date === date && (g.home === teamId || g.away === teamId));
}

/** Session actually run by `teamId` on `date` — game days are forced to shootaround. */
export function sessionOn(s: GameState, teamId: string, date: string): Session {
  if (teamHasGame(s, teamId, date)) return 'shootaround';
  return planSchedule(s, teamId)[weekday(date)];
}

/** Weekly (Mon–Sun) average growth multiplier for a team's effective schedule — used by progression. */
export function scheduleGrowthMul(s: GameState, teamId: string): number {
  const start = weekStart(s.date);
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += SESSION_EFFECTS[sessionOn(s, teamId, addDays(start, i))].growth;
  return sum / 7;
}

/** Weekly average injury multiplier from the schedule (high-intensity days raise it). */
export function scheduleInjuryMul(s: GameState, teamId: string): number {
  const start = weekStart(s.date);
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += SESSION_EFFECTS[sessionOn(s, teamId, addDays(start, i))].injury;
  return sum / 7;
}

/** Film sessions in the current week — drives the offIQ/helpD film bonus in progression. */
export function filmSessionsThisWeek(s: GameState, teamId: string): number {
  const start = weekStart(s.date);
  let n = 0;
  for (let i = 0; i < 7; i++) if (sessionOn(s, teamId, addDays(start, i)) === 'film') n++;
  return n;
}

/** Projected familiarity gained this week (baseline drift + session bonuses) — UI summary. */
export function weeklyFamiliarityGain(s: GameState, teamId: string): number {
  const start = weekStart(s.date);
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const session = sessionOn(s, teamId, addDays(start, i));
    const filmBonus = session === 'film' && hasNode(s, teamId, 'training_filmRoom') ? 2 : 0;
    sum += 0.3 + SESSION_EFFECTS[session].familiarity + filmBonus;
  }
  return sum;
}

/** User applied a new offense/defense: team's practice drops off hard. Call from Playbook Apply. */
export function onTacticsChanged(team: TeamState): void {
  team.familiarity = Math.min(team.familiarity ?? 60, 35);
}

/** Daily hook (called from daily.ts): fatigue + familiarity drift for every team's roster. */
export function trainingDaily(s: GameState): void {
  for (const team of Object.values(s.teams)) {
    const session = sessionOn(s, team.id, s.date);
    const eff = SESSION_EFFECTS[session];
    const recoveryBonus = (hasNode(s, team.id, 'training_recoveryPool') ? 3 : 0) + (hasSpec(s, team.id, 'recovery') ? 2 : 0);
    const filmBonus = session === 'film' && hasNode(s, team.id, 'training_filmRoom') ? 2 : 0;
    team.familiarity = clamp((team.familiarity ?? 60) + 0.3 + eff.familiarity + filmBonus, 0, 100);
    const fatigueDelta = eff.fatigue - (NATURAL_RECOVERY + recoveryBonus);
    for (const p of Object.values(s.players)) {
      if (p.teamId !== team.id || p.retired) continue;
      p.fatigue = clamp((p.fatigue ?? 0) + fatigueDelta, 0, 100);
    }
  }
}
