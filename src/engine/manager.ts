// Manager career: hot seat, sackings and the job market. You can be fired and hired elsewhere,
// including across leagues — reputation decides which clubs call.
import type { GameState, JobOffer, ObjectiveKind } from './model';
import { hashString, mulberry32 } from './rng';
import { addDays, daysBetween } from './schedule';
import { standings } from './season';
import { leagueOf } from './leagues';
import { objectiveByRank, objectiveLabel, LONG_TERM } from './mgmt/board';
import { teamStrengthRank } from './mgmt/market';
import { euroBudget } from './euro';
import { capNumbers, payroll } from './cba';
import { defaultTraining } from './progression';
import { refreshRotation } from './rotation';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function msg(s: GameState, from: string, subject: string, body: string, kind: GameState['messages'][number]['kind'] = 'board') {
  s.messages.unshift({ id: s.nextId++, date: s.date, from, subject, body, read: false, kind });
}

/** Expected win rate for this roster, used to judge whether results are bad enough to sack. */
function expectation(s: GameState, teamId: string): number {
  const rank = teamStrengthRank(s, teamId);
  const n = Object.values(s.teams).filter((t) => (t.league ?? 'NBA') === (s.teams[teamId].league ?? 'NBA')).length;
  return clamp(0.72 - (rank - 1) / Math.max(1, n - 1) * 0.42, 0.28, 0.72);
}

/** 0–100 risk that the board pulls the trigger. Driven by confidence, results vs expectation and tenure. */
export function hotSeat(s: GameState): number {
  const b = s.board;
  const row = standings(s).find((r) => r.teamId === s.userTeamId);
  const played = row ? row.w + row.l : 0;
  const pct = played ? row!.w / played : 0.5;
  const gap = expectation(s, s.userTeamId) - pct;          // positive = underperforming
  const honeymoon = daysBetween(s.manager.hiredOn, s.date) < 120 ? 25 : 0;
  const risk = (60 - b.confidence) * 1.1 + Math.max(0, gap) * 120 + (played >= 20 ? 0 : -25) - honeymoon;
  return Math.round(clamp(risk, 0, 100));
}

function clubSalary(s: GameState, teamId: string): number {
  const rep = s.manager.reputation;
  const league = leagueOf(s.teams[teamId].league);
  const base = league.economy === 'cap' ? 3_000_000 : 1_200_000;
  return Math.round((base * (0.6 + rep / 100)) / 50_000) * 50_000;
}

function makeOffer(s: GameState, teamId: string, reason: string, rng: () => number): JobOffer {
  const league = s.teams[teamId].league ?? 'NBA';
  const objective: ObjectiveKind = objectiveByRank(teamStrengthRank(s, teamId));
  const budget = leagueOf(league).economy === 'cap'
    ? Math.max(0, capNumbers(s.seasonYear).cap - payroll(s, teamId))
    : euroBudget(s, teamId);
  return {
    id: s.nextId++, date: s.date, teamId, league, objective,
    salary: clubSalary(s, teamId), years: 2 + Math.floor(rng() * 3), budget,
    expires: addDays(s.date, 7), reason,
  };
}

/** Clubs whose seat is open and whose stature matches the manager's reputation. */
function candidateClubs(s: GameState): string[] {
  const rep = s.manager.reputation;
  return Object.values(s.teams)
    .filter((t) => t.id !== s.userTeamId)
    .map((t) => ({ id: t.id, rank: teamStrengthRank(s, t.id) }))
    .filter(({ rank }) => {
      const stature = 100 - rank * 2.2;                     // strong clubs ≈ 95, weak ≈ 35
      return stature <= rep + 18 && stature >= rep - 45;
    })
    .map((x) => x.id);
}

export function sackManager(s: GameState, reason: string) {
  const team = s.teams[s.userTeamId];
  const row = standings(s).find((r) => r.teamId === s.userTeamId);
  s.manager.history.push({
    teamId: team.id, from: s.manager.hiredOn, to: s.date,
    record: row ? `${row.w}-${row.l}` : '—', result: 'Sacked',
  });
  s.manager.unemployed = true;
  s.manager.reputation = clamp(s.manager.reputation - 12, 5, 100);
  s.manager.hotSeat = 100;
  msg(s, 'Board of Directors', 'You have been relieved of your duties',
    `${team.name} have decided to make a change. ${reason} Your record was ${row ? `${row.w}-${row.l}` : 'incomplete'}. ` +
    'Clubs looking for a coach will contact you — watch your inbox.');
}

export function acceptJob(s: GameState, offerId: number): string | null {
  const offer = s.manager.offers.find((o) => o.id === offerId);
  if (!offer) return 'That offer is no longer on the table';
  if (!s.manager.unemployed) return 'You are already under contract — resign first';
  const team = s.teams[offer.teamId];
  s.userTeamId = offer.teamId;
  s.manager.unemployed = false;
  s.manager.hiredOn = s.date;
  s.manager.salary = offer.salary;
  s.manager.contractYears = offer.years;
  s.manager.offers = [];
  s.manager.hotSeat = 15;
  s.manager.history.push({ teamId: team.id, from: s.date, record: '0-0', result: 'In charge' });
  s.board = { confidence: 62, objective: offer.objective, longTerm: LONG_TERM[offer.objective], budgetMul: 1, history: s.board.history };
  s.training[team.id] = s.training[team.id] ?? defaultTraining();
  refreshRotation(team, s.players);
  msg(s, `${team.name}`, `Welcome to ${team.name}`,
    `You have signed a ${offer.years}-year deal worth $${(offer.salary / 1e6).toFixed(2)}M per season. The board expects: ${objectiveLabel(offer.objective)}.`);
  return null;
}

export function resignPost(s: GameState): string | null {
  if (s.manager.unemployed) return 'You have no club';
  const row = standings(s).find((r) => r.teamId === s.userTeamId);
  s.manager.history.push({ teamId: s.userTeamId, from: s.manager.hiredOn, to: s.date, record: row ? `${row.w}-${row.l}` : '—', result: 'Resigned' });
  s.manager.unemployed = true;
  s.manager.reputation = clamp(s.manager.reputation - 4, 5, 100);
  msg(s, 'Press Office', 'You have resigned', 'You have left your post. Offers may arrive in the coming days.');
  return null;
}

/** Daily: update the hot seat, fire the manager when the board runs out of patience, and float job offers. */
export function managerDaily(s: GameState) {
  const rng = mulberry32(hashString(`${s.seed}|mgr|${s.date}`));
  s.manager.offers = s.manager.offers.filter((o) => o.expires >= s.date);

  if (!s.manager.unemployed) {
    s.manager.hotSeat = hotSeat(s);
    const inSeason = s.phase === 'regular' || s.phase === 'playin' || s.phase === 'playoffs';
    if (inSeason && s.manager.hotSeat >= 85 && rng() < 0.08) {
      sackManager(s, 'Results have fallen well short of expectations.');
    } else if (s.manager.hotSeat >= 70 && rng() < 0.02) {
      msg(s, 'Board of Directors', 'The board wants improvement',
        'Ownership is unhappy with the direction of the season. Results must improve, quickly.');
    }
    // Rival clubs court a successful manager during the offseason.
    if (s.phase === 'offseason' && s.manager.reputation >= 60 && s.manager.offers.length < 2 && rng() < 0.05) {
      const pool = candidateClubs(s).filter((id) => teamStrengthRank(s, id) < teamStrengthRank(s, s.userTeamId));
      if (pool.length) s.manager.offers.push(makeOffer(s, pool[Math.floor(rng() * pool.length)], 'They want to poach you from your current club.', rng));
    }
    return;
  }

  // Unemployed: clubs with a vacancy come calling, better clubs the higher the reputation.
  if (s.manager.offers.length >= 3 || rng() > 0.45) return;
  const pool = candidateClubs(s).filter((id) => !s.manager.offers.some((o) => o.teamId === id));
  if (!pool.length) return;
  const pick = pool[Math.floor(rng() * pool.length)];
  const reasons = ['Their coach was dismissed after a poor run.', 'The club parted ways with their coach by mutual consent.', 'Their coach left for another job.', 'The board wants a fresh voice in the locker room.'];
  const offer = makeOffer(s, pick, reasons[Math.floor(rng() * reasons.length)], rng);
  s.manager.offers.push(offer);
  const t = s.teams[pick];
  msg(s, `${t.name}`, `Job offer: ${t.name}`,
    `${offer.reason} They offer ${offer.years} years at $${(offer.salary / 1e6).toFixed(2)}M per season. Objective: ${objectiveLabel(offer.objective)}.`, 'board');
}

/** Reputation moves with results: titles and objectives up, sackings and collapses down. */
export function reputationAfterSeason(s: GameState, met: boolean, champion: boolean) {
  const delta = (champion ? 12 : 0) + (met ? 5 : -6);
  s.manager.reputation = clamp(s.manager.reputation + delta, 5, 100);
}
