// Ownership expectations: confidence, season objective, budget multiplier.
import type { Board, Game, GameState, ObjectiveKind } from '../model';
import { standings } from '../season';
import { clamp, teamStrengthRank } from './market';

const TIER: Record<ObjectiveKind, number> = { develop: 0, playin: 1, playoffs: 2, confFinals: 3, finals: 4, title: 5 };
const RESULT_LABEL = [
  'Missed the postseason',
  'Eliminated in the Play-In Tournament',
  'Eliminated in the Playoffs',
  'Eliminated in the Conference Finals',
  'Runner-up in the NBA Finals',
  'Won the Championship',
];
const LONG_TERM: Record<ObjectiveKind, string> = {
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

function objectiveByRank(rank: number): ObjectiveKind {
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
  b.budgetMul = clamp(0.8 + b.confidence / 250, 0.8, 1.2);
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
  b.budgetMul = clamp(0.8 + b.confidence / 250, 0.8, 1.2);
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
  b.budgetMul = clamp(0.8 + b.confidence / 250, 0.8, 1.2);
}
