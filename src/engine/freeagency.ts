// Free agents: asks, signing, releasing, AI in-season depth signings, offseason market.
import type { GameState, Player } from './model';
import { capNumbers, contractRows, rostersByTeam, desiredYears, isTwoWay, marketValue, minSalary, payroll, rosterOf, salaryIn, seasonLabel, signingCheck } from './cba';
import { ageOf } from './ratings';
import { hashString, mulberry32 } from './rng';
import { refreshRotation } from './rotation';
import { daysBetween } from './schedule';
import { euroBudget, euroSalary, euroWage } from './euro';
import { leagueOf } from './leagues';

export const freeAgents = (s: GameState) => Object.values(s.players).filter((p) => !p.teamId && !p.prospect && !p.retired);

/** European clubs pay wages against a board budget; NBA teams work the salary cap. */
export const isBudgetClub = (s: GameState, teamId: string) => leagueOf(s.teams[teamId]?.league).economy === 'budget';

/** Wage budget a European club still has free for `season`. */
export function euroRoom(s: GameState, teamId: string, season: string): number {
  return euroBudget(s, teamId) - rosterOf(s, teamId).reduce((x, q) => x + salaryIn(q, season), 0);
}

/** A European club signs a free agent on European wages (never the NBA scale). */
export function signEuro(s: GameState, teamId: string, p: Player, startYear: number) {
  p.teamId = teamId;
  p.affiliate = undefined;
  p.assigned = false;
  p.contract = euroSalary(p, startYear);
  refreshRotation(s.teams[teamId], s.players);
  const c = p.contract;
  s.transactions.unshift({ date: s.date, kind: 'sign', text: `${s.teams[teamId].abbr} sign ${p.firstName} ${p.lastName} (${c.salaries.length}y, $${(c.salaries[0].amount / 1e6).toFixed(2)}M)`, teams: [teamId] });
}

/** What the player wants. In-season the ask decays the longer he stays unsigned. */
export function askingPrice(s: GameState, p: Player): { amount: number; years: number } {
  const mv = marketValue(p, s.seasonYear);
  const unsignedDays = s.phase === 'offseason' ? 0 : Math.max(0, daysBetween(`${s.seasonYear}-10-01`, s.date));
  const decay = Math.max(0.55, 1 - unsignedDays / 400);
  const amount = Math.max(minSalary(s.seasonYear, p.yearsPro), Math.round((mv * decay) / 10_000) * 10_000);
  return { amount, years: desiredYears(p, s.seasonYear) };
}

/** Exported for negotiation.ts: commits a deal once terms are already agreed (bypasses the ask-price gate below, which re-derives a fresh ask and would fight an already-negotiated number). */
export function sign(s: GameState, teamId: string, p: Player, amount: number, years: number, twoWay: boolean) {
  const startYear = s.phase === 'offseason' ? s.seasonYear + 1 : s.seasonYear;
  p.teamId = teamId;
  p.affiliate = undefined;
  p.assigned = false;
  p.contract = { salaries: contractRows(startYear, amount, years), type: twoWay ? 'two-way' : amount <= minSalary(s.seasonYear, p.yearsPro) * 1.001 ? 'min' : 'standard' };
  refreshRotation(s.teams[teamId], s.players);
  const text = `${s.teams[teamId].abbr} sign ${p.firstName} ${p.lastName} (${years}y, $${(amount / 1e6).toFixed(1)}M${twoWay ? ', two-way' : ''})`;
  s.transactions.unshift({ date: s.date, kind: 'sign', text, teams: [teamId] });
  if (teamId === s.userTeamId) s.messages.unshift({ id: s.nextId++, date: s.date, from: 'Front Office', subject: 'Contract signed', body: text, read: false, kind: 'trade' });
}

/** User offer. Returns null on success, or the reason it failed. */
export function offerContract(s: GameState, teamId: string, pid: string, amount: number, years: number, twoWay = false): string | null {
  const p = s.players[pid];
  if (!p || p.teamId || p.prospect) return 'Player is not a free agent';
  if (twoWay && (p.yearsPro > 4 || p.ratings.ovr > 72)) return 'Not eligible for a two-way contract';
  const check = signingCheck(s, teamId, p, twoWay ? 0 : amount, twoWay);
  if (check.reason) return check.reason;
  const ask = askingPrice(s, p);
  if (!twoWay && amount < ask.amount * 0.97) return `${p.lastName} wants at least $${(ask.amount / 1e6).toFixed(2)}M`;
  if (!twoWay && Math.abs(years - ask.years) > 1 && amount < ask.amount * 1.1) return `${p.lastName} wants about ${ask.years} years`;
  if (check.usesMle) s.teams[teamId].mleUsed = true;
  sign(s, teamId, p, twoWay ? 636_435 : amount, twoWay ? 1 : years, twoWay);
  return null;
}

/** Waive: remaining salary this season and future seasons stays on the cap as dead money. */
export function releasePlayer(s: GameState, pid: string): string | null {
  const p = s.players[pid];
  if (!p?.teamId) return 'Not on a roster';
  const team = s.teams[p.teamId];
  if (p.contract && !isTwoWay(p)) {
    team.deadCap = [...(team.deadCap ?? []), ...p.contract.salaries.filter((x) => x.season >= s.season).map((x) => ({ season: x.season, amount: x.amount }))];
  }
  s.transactions.unshift({ date: s.date, kind: 'release', text: `${team.abbr} waive ${p.firstName} ${p.lastName}`, teams: [team.id] });
  p.teamId = null;
  p.assigned = false;
  p.contract = null;
  refreshRotation(team, s.players);
  return null;
}

/** AI teams keep 14+ standard players and fill holes caused by long injuries with minimum deals. */
export function freeAgencyDaily(s: GameState) {
  if (s.phase === 'offseason' || s.phase === 'playoffs') return;
  const rng = mulberry32(hashString(`${s.seed}|fa|${s.date}`));
  if (rng() > 0.35) return;
  const pool = freeAgents(s).sort((a, b) => b.ratings.ovr - a.ratings.ovr);
  const rosters = rostersByTeam(s);
  for (const t of Object.keys(s.teams)) {
    if (t === s.userTeamId || !pool.length) continue;
    const roster = rosters.get(t)!.filter((p) => !isTwoWay(p));
    const healthy = roster.filter((p) => !p.injury || p.injury.daysLeft < 10).length;
    if (isBudgetClub(s, t)) {
      if (roster.length >= 13 || (roster.length >= 12 && healthy >= 11)) continue;
      const room = euroRoom(s, t, s.season);
      const p = pool.find((x) => euroWage(x.ratings.ovr, ageOf(x.birthDate, new Date(s.date))) <= room);
      if (p) { pool.splice(pool.indexOf(p), 1); signEuro(s, t, p, s.seasonYear); }
      continue;
    }
    if (roster.length >= 15 || (roster.length >= 14 && healthy >= 12)) continue;
    // Call up from our own affiliate when he's about as good as anyone out there.
    const own = pool.find((x) => x.affiliate === t && x.ratings.ovr >= pool[0].ratings.ovr - 3);
    const p = own ?? pool[0];
    pool.splice(pool.indexOf(p), 1);
    const amt = minSalary(s.seasonYear, p.yearsPro);
    if (!signingCheck(s, t, p, amt).reason) sign(s, t, p, amt, 1, false);
  }
}

// ---------- offseason ----------

/** End of season: expired deals → free agency (user gets message to re-sign via Bird rights before FA opens). */
export function expireContracts(s: GameState) {
  const next = seasonLabel(s.seasonYear + 1);
  const apron2 = capNumbers(s.seasonYear + 1).apron2;
  const exp = Object.values(s.players)
    .filter((p) => p.teamId && p.teamId !== s.userTeamId && !p.retired && p.contract && !p.contract.salaries.some((x) => x.season >= next))
    .sort((a, b) => b.ratings.ovr - a.ratings.ovr); // best players get first claim on the budget
  for (const p of exp) {
    const age = ageOf(p.birthDate, new Date(s.date));
    if (isBudgetClub(s, p.teamId!)) {
      // European clubs keep useful players if the wage budget allows, on European money.
      const c = euroSalary(p, s.seasonYear + 1);
      if (p.ratings.ovr >= 64 && age <= 33 && euroRoom(s, p.teamId!, next) >= c.salaries[0].amount) p.contract = c;
      else { p.teamId = null; p.contract = null; }
      continue;
    }
    // AI re-signs good players with Bird rights while staying under the second apron; others walk.
    const ask = askingPrice(s, p);
    const keep = p.ratings.ovr >= 72 && age <= 33 && payroll(s, p.teamId!, next) + ask.amount <= apron2;
    if (keep) p.contract = { ...p.contract!, salaries: contractRows(s.seasonYear + 1, ask.amount, ask.years), type: 'standard' };
    else { p.teamId = null; p.contract = null; }
  }
}

/** One day of the offseason market: each AI team with cap room or needs makes at most one signing. */
export function offseasonMarketDay(s: GameState, day: number) {
  const rng = mulberry32(hashString(`${s.seed}|ofa|${s.season}|${day}`));
  const next = seasonLabel(s.seasonYear + 1);
  const pool = freeAgents(s).sort((a, b) => b.ratings.ovr - a.ratings.ovr);
  // NBA teams get first call each day; European clubs pick from what is left, on European wages.
  const shuffled = Object.keys(s.teams).filter((t) => t !== s.userTeamId).sort(() => rng() - 0.5);
  const teams = [...shuffled.filter((t) => !isBudgetClub(s, t)), ...shuffled.filter((t) => isBudgetClub(s, t))];
  const cap = capNumbers(s.seasonYear + 1);
  for (const t of teams) {
    if (isBudgetClub(s, t)) {
      if (rosterOf(s, t).length >= leagueOf(s.teams[t].league).maxRoster - 1) continue;
      const room = euroRoom(s, t, next);
      const target = pool.find((p) => euroWage(p.ratings.ovr, ageOf(p.birthDate, new Date(s.date))) <= room);
      if (!target) continue;
      pool.splice(pool.indexOf(target), 1);
      signEuro(s, t, target, s.seasonYear + 1);
      continue;
    }
    const roster = rosterOf(s, t).filter((p) => !isTwoWay(p));
    if (roster.length >= 15) continue;
    const room = cap.cap - payroll(s, t, next);
    const budget = room > 0 ? room : !s.teams[t].mleUsed ? cap.mle : 0;
    const target = pool.find((p) => askingPrice(s, p).amount * (1 - day * 0.03) <= Math.max(budget, minSalary(s.seasonYear, p.yearsPro)));
    if (!target) continue;
    const ask = askingPrice(s, target);
    const amount = Math.max(minSalary(s.seasonYear, target.yearsPro), Math.min(ask.amount, Math.round(ask.amount * (1 - day * 0.03))));
    if (room <= 0 && amount > minSalary(s.seasonYear, target.yearsPro)) s.teams[t].mleUsed = true;
    pool.splice(pool.indexOf(target), 1);
    sign(s, t, target, amount, ask.years, false);
  }
  void salaryIn;
}
