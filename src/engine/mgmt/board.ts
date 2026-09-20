// Ownership expectations: confidence, season objective, budget multiplier.
import type { Board, BoardPromise, Game, GameState, ObjectiveKind } from '../model';
import { standings } from '../season';
import { clamp, teamStrengthRank } from './market';
import { addDays, daysBetween } from '../schedule';
import { hashString, mulberry32 } from '../rng';
import { payroll } from '../cba';
import { ageOf } from '../ratings';

declare module '../model' {
  interface Board {
    lastMeeting?: string;
    budgetBonus?: number;
    lastRenegotiateSeason?: string;
  }
  interface BoardPromise {
    baseline?: number;
  }
}

const TIER: Record<ObjectiveKind, number> = { develop: 0, playin: 1, playoffs: 2, confFinals: 3, finals: 4, title: 5 };
const RESULT_LABEL = [
  'Missed the postseason',
  'Eliminated in the Play-In Tournament',
  'Eliminated in the Playoffs',
  'Eliminated in the Conference Finals',
  'Runner-up in the NBA Finals',
  'Won the Championship',
];
export const LONG_TERM: Record<ObjectiveKind, string> = {
  title: 'Build a roster capable of winning it all, year after year.',
  finals: 'Push this core to the NBA Finals within the next two seasons.',
  confFinals: 'Establish the franchise as a perennial conference contender.',
  playoffs: "Secure the roster's playoff floor while developing the next core piece.",
  playin: 'Climb out of the play-in and into the playoff picture.',
  develop: 'Focus on development and asset accumulation — this is a rebuilding phase.',
};

export function objectiveLabel(k: ObjectiveKind): string {
  switch (k) {
    case 'title': return 'Win the Championship';
    case 'finals': return 'Reach the NBA Finals';
    case 'confFinals': return 'Reach the Conference Finals';
    case 'playoffs': return 'Make the Playoffs';
    case 'playin': return 'Reach the Play-In Tournament';
    default: return 'Develop the Roster';
  }
}

export function objectiveByRank(rank: number): ObjectiveKind {
  if (rank <= 3) return 'title';
  if (rank <= 6) return 'finals';
  if (rank <= 10) return 'confFinals';
  if (rank <= 16) return 'playoffs';
  if (rank <= 22) return 'playin';
  return 'develop';
}

export function initBoard(s: GameState): void {
  const objective = objectiveByRank(teamStrengthRank(s, s.userTeamId));
  const board: Board = { confidence: 60, objective, longTerm: LONG_TERM[objective], budgetMul: 1, history: [] };
  s.board = board;
}

function msg(s: GameState, subject: string, body: string) {
  s.messages.unshift({ id: s.nextId++, date: s.date, from: 'Board of Directors', subject, body, read: false, kind: 'board' });
}

function recomputeBudgetMul(b: Board): void {
  b.budgetMul = clamp(0.8 + b.confidence / 250 + (b.budgetBonus ?? 0), 0.8, 1.35);
}

export function boardAfterGame(s: GameState, g: Game): void {
  const b = s.board;
  const us = g.home === s.userTeamId;
  const my = us ? g.result!.home : g.result!.away;
  const opp = us ? g.result!.away : g.result!.home;
  const won = my > opp;
  const margin = Math.abs(my - opp);
  const oppId = us ? g.away : g.home;
  const favored = teamStrengthRank(s, s.userTeamId) < teamStrengthRank(s, oppId);
  let delta = won ? (favored ? 0.6 : 1.5) : (favored ? -1.5 : -0.6);
  if (margin >= 20) delta += won ? 0.4 : -0.4;
  const streak = standings(s, s.teams[s.userTeamId].conference).find((r) => r.teamId === s.userTeamId)?.streak ?? 0;
  if (Math.abs(streak) >= 3) delta += Math.sign(streak) * 0.3;
  b.confidence = clamp(b.confidence + delta, 0, 100);
  recomputeBudgetMul(b);
}

function achievedTier(s: GameState): number {
  if (s.champion === s.userTeamId) return 5;
  const won = (round: number) => s.series.some((se) => se.round === round && se.kind === 'playoff' && se.winner === s.userTeamId);
  if (won(3)) return 4;
  if (won(2)) return 3;
  const madePlayoffs = s.series.some((se) => se.kind === 'playoff' && (se.high === s.userTeamId || se.low === s.userTeamId));
  if (madePlayoffs) return 2;
  const madePlayIn = s.series.some((se) => se.kind === 'playin' && (se.high === s.userTeamId || se.low === s.userTeamId));
  if (madePlayIn) return 1;
  return 0;
}

function finalizeSeason(s: GameState): void {
  const b = s.board;
  if (b.history.some((h) => h.season === s.season)) return;
  const tier = achievedTier(s);
  const met = tier >= TIER[b.objective];
  b.confidence = clamp(b.confidence + (met ? 10 : -12), 0, 100);
  const result = RESULT_LABEL[tier];
  b.history.push({ season: s.season, objective: b.objective, result, met });
  recomputeBudgetMul(b);
  msg(
    s,
    met ? 'Board pleased with the season' : 'Board disappointed with the season',
    `${result}. Preseason objective was to ${objectiveLabel(b.objective).toLowerCase()}. ${met ? 'Expectations were met.' : 'Expectations were not met.'}`
  );
}

/** Called when phase changes (e.g. playoffs start / champion decided) to evaluate objectives. */
export function boardOnPhase(s: GameState): void {
  const b = s.board;
  if (s.phase === 'playin') {
    const conf = s.teams[s.userTeamId].conference;
    const seed = standings(s, conf).findIndex((r) => r.teamId === s.userTeamId) + 1;
    if (seed <= 6) b.confidence = clamp(b.confidence + 6, 0, 100);
    else if (seed > 10) {
      b.confidence = clamp(b.confidence - 10, 0, 100);
      finalizeSeason(s);
    }
  } else if (s.phase === 'playoffs') {
    const inPlayoffs = s.series.some((se) => se.kind === 'playoff' && (se.high === s.userTeamId || se.low === s.userTeamId));
    if (!inPlayoffs) {
      b.confidence = clamp(b.confidence - 8, 0, 100);
      finalizeSeason(s);
    } else {
      b.confidence = clamp(b.confidence + 6, 0, 100);
    }
  } else if (s.phase === 'offseason') {
    finalizeSeason(s);
  }
  recomputeBudgetMul(b);
}

// ---------- board meetings (C: between-match activities) ----------

export type BudgetKind = 'payroll' | 'facilities' | 'staff';

/** Once per month, or sooner after a big (4+) win/loss streak (min 7-day gap). */
export function boardMeetingAvailable(s: GameState): boolean {
  const b = s.board;
  if (!b.lastMeeting) return true;
  if (daysBetween(b.lastMeeting, s.date) >= 30) return true;
  const streak = standings(s, s.teams[s.userTeamId].conference).find((r) => r.teamId === s.userTeamId)?.streak ?? 0;
  return Math.abs(streak) >= 4 && daysBetween(b.lastMeeting, s.date) >= 7;
}

export function budgetSuccessChance(s: GameState, _kind: BudgetKind): number {
  const b = s.board;
  const winPct = standings(s, s.teams[s.userTeamId].conference).find((r) => r.teamId === s.userTeamId)?.pct ?? 0.5;
  return clamp(0.3 + (b.confidence / 100) * 0.5 + (winPct - 0.5) * 0.4, 0.05, 0.95);
}

export function requestBudget(s: GameState, kind: BudgetKind): string {
  if (!boardMeetingAvailable(s)) return 'The board is not available for another meeting yet.';
  const b = s.board;
  b.lastMeeting = s.date;
  const chance = budgetSuccessChance(s, kind);
  const rng = mulberry32(hashString(`${s.seed}|budget|${kind}|${s.date}`));
  if (rng() < chance) {
    if (kind === 'staff') {
      b.budgetBonus = clamp((b.budgetBonus ?? 0) + 0.06, 0, 0.3);
      recomputeBudgetMul(b);
      msg(s, 'Budget request approved', 'The board approves a bigger coaching & scouting staff budget.');
      return 'Approved — staff budget increased.';
    }
    const cash = kind === 'payroll' ? Math.round(4_000_000 + rng() * 4_000_000) : Math.round(3_000_000 + rng() * 3_000_000);
    s.finance.cash += cash;
    msg(s, 'Budget request approved', `The board approves a one-off $${(cash / 1e6).toFixed(1)}M ${kind === 'payroll' ? 'cash injection' : 'facilities investment'}.`);
    return `Approved — $${(cash / 1e6).toFixed(1)}M added.`;
  }
  b.confidence = clamp(b.confidence - (3 + Math.round(rng() * 3)), 0, 100);
  recomputeBudgetMul(b);
  msg(s, 'Budget request denied', `The board denies the ${kind} budget request.`);
  return 'Denied — the board is not convinced.';
}

const PROMISE_LABEL: Record<BoardPromise['kind'], (t: number) => string> = {
  playoffs: () => 'Reach the playoffs this season',
  wins: (t) => `Win at least ${t} games this season`,
  develop: (t) => `Grow the young core by ${t} combined OVR`,
  payroll: (t) => `Cut payroll by $${(t / 1e6).toFixed(1)}M`,
  title: () => 'Win the championship this season',
};
const PROMISE_REWARD: Record<BoardPromise['kind'], { keep: number; broken: number; budget?: number }> = {
  playoffs: { keep: 8, broken: 10, budget: 3_000_000 },
  wins: { keep: 6, broken: 8 },
  develop: { keep: 5, broken: 4 },
  payroll: { keep: 5, broken: 4 },
  title: { keep: 15, broken: 15, budget: 8_000_000 },
};

/** Make a board promise. target is optional; a sensible default is filled in per kind. */
export function makePromise(s: GameState, kind: BoardPromise['kind'], target?: number): BoardPromise {
  const b = s.board;
  const youngOvr = () => Object.values(s.players)
    .filter((p) => p.teamId === s.userTeamId && !p.retired && ageOf(p.birthDate, new Date(s.date)) <= 23)
    .reduce((sum, p) => sum + p.ratings.ovr, 0);
  let t = target;
  let baseline: number | undefined;
  let deadline: string;
  switch (kind) {
    case 'wins': {
      const w = standings(s, s.teams[s.userTeamId].conference).find((r) => r.teamId === s.userTeamId)?.w ?? 0;
      t = t ?? w + 8;
      deadline = s.keyDates.regularEnd;
      break;
    }
    case 'playoffs':
      t = 1;
      deadline = s.keyDates.regularEnd;
      break;
    case 'title':
      t = 1;
      deadline = addDays(s.keyDates.regularEnd, 45);
      break;
    case 'develop':
      t = t ?? 5;
      baseline = youngOvr();
      deadline = addDays(s.date, 60);
      break;
    case 'payroll':
      t = t ?? 5_000_000;
      baseline = payroll(s, s.userTeamId);
      deadline = addDays(s.date, 60);
      break;
  }
  const reward = PROMISE_REWARD[kind];
  const promise: BoardPromise = {
    id: s.nextId++, date: s.date, kind, target: t!, label: PROMISE_LABEL[kind](t!),
    deadline, status: 'open', reward: { confidence: reward.keep, budget: reward.budget }, baseline,
  };
  s.promises.unshift(promise);
  msg(s, 'Promise made to the board', `You've promised the board: ${promise.label}.`);
  return promise;
}

function settlePromise(s: GameState, pr: BoardPromise, kept: boolean): void {
  const b = s.board;
  pr.status = kept ? 'kept' : 'broken';
  const reward = PROMISE_REWARD[pr.kind];
  if (kept) {
    b.confidence = clamp(b.confidence + reward.keep, 0, 100);
    if (pr.reward.budget) s.finance.cash += pr.reward.budget;
    msg(s, 'Promise kept', `You delivered on your promise: ${pr.label}.`);
  } else {
    b.confidence = clamp(b.confidence - reward.broken, 0, 100);
    msg(s, 'Promise broken', `You failed to deliver on your promise: ${pr.label}. The board is unhappy.`);
  }
  recomputeBudgetMul(b);
}

/** Called once per sim day. Settles promises early when clearly achieved, or at their deadline. */
export function checkPromises(s: GameState): void {
  for (const pr of s.promises) {
    if (pr.status !== 'open') continue;
    let met: boolean | undefined;
    switch (pr.kind) {
      case 'wins': {
        const w = standings(s, s.teams[s.userTeamId].conference).find((r) => r.teamId === s.userTeamId)?.w ?? 0;
        if (w >= pr.target) met = true;
        break;
      }
      case 'playoffs':
        if (achievedTier(s) >= 2) met = true;
        break;
      case 'title':
        if (s.champion === s.userTeamId) met = true;
        else if (s.champion && s.champion !== s.userTeamId) met = false;
        break;
      case 'develop': {
        const cur = Object.values(s.players)
          .filter((p) => p.teamId === s.userTeamId && !p.retired && ageOf(p.birthDate, new Date(s.date)) <= 23)
          .reduce((sum, p) => sum + p.ratings.ovr, 0);
        if (cur - (pr.baseline ?? 0) >= pr.target) met = true;
        break;
      }
      case 'payroll':
        if ((pr.baseline ?? 0) - payroll(s, s.userTeamId) >= pr.target) met = true;
        break;
    }
    if (met === true) { settlePromise(s, pr, true); continue; }
    if (met === false || s.date >= pr.deadline) settlePromise(s, pr, false);
  }
}

const OBJECTIVE_ORDER: ObjectiveKind[] = ['develop', 'playin', 'playoffs', 'confFinals', 'finals', 'title'];

/** Once per season: ask the board to lower (costs confidence) or raise (gains confidence) the objective. */
export function renegotiateObjective(s: GameState, direction: 'lower' | 'raise'): string {
  const b = s.board;
  if (b.lastRenegotiateSeason === s.season) return 'The board already revisited the objective this season.';
  const idx = OBJECTIVE_ORDER.indexOf(b.objective);
  if (direction === 'lower' && idx <= 0) return 'The objective is already at its lowest.';
  if (direction === 'raise' && idx >= OBJECTIVE_ORDER.length - 1) return 'The objective is already at its highest.';
  b.lastRenegotiateSeason = s.season;
  b.objective = OBJECTIVE_ORDER[idx + (direction === 'raise' ? 1 : -1)];
  b.confidence = clamp(b.confidence + (direction === 'raise' ? 8 : -6), 0, 100);
  b.longTerm = LONG_TERM[b.objective];
  recomputeBudgetMul(b);
  msg(s, 'Objective revised', `The board has revised the season objective to ${objectiveLabel(b.objective).toLowerCase()}.`);
  return `New objective: ${objectiveLabel(b.objective)}.`;
}
