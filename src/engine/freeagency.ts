// Free agents: asks, signing, releasing, AI in-season depth signings, offseason market.
import type { GameState, Player } from './model';
import { capNumbers, contractRows, rostersByTeam, desiredYears, isTwoWay, marketValue, minSalary, payroll, rosterOf, salaryIn, seasonLabel, signingCheck } from './cba';
import { ageOf } from './ratings';
import { hashString, mulberry32 } from './rng';
import { refreshRotation } from './rotation';
import { daysBetween } from './schedule';

export const freeAgents = (s: GameState) => Object.values(s.players).filter((p) => !p.teamId && !p.prospect && !p.retired);

/** What the player wants. In-season the ask decays the longer he stays unsigned. */
export function askingPrice(s: GameState, p: Player): { amount: number; years: number } {
  const mv = marketValue(p, s.seasonYear);
  const unsignedDays = s.phase === 'offseason' ? 0 : Math.max(0, daysBetween(`${s.seasonYear}-10-01`, s.date));
  const decay = Math.max(0.55, 1 - unsignedDays / 400);
  const amount = Math.max(minSalary(s.seasonYear, p.yearsPro), Math.round((mv * decay) / 10_000) * 10_000);
  return { amount, years: desiredYears(p, s.seasonYear) };
}

function sign(s: GameState, teamId: string, p: Player, amount: number, years: number, twoWay: boolean) {
  const startYear = s.phase === 'offseason' ? s.seasonYear + 1 : s.seasonYear;
  p.teamId = teamId;
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
    if (roster.length >= 15 || (roster.length >= 14 && healthy >= 12)) continue;
    const p = pool.shift()!;
    const amt = minSalary(s.seasonYear, p.yearsPro);
    if (!signingCheck(s, t, p, amt).reason) sign(s, t, p, amt, 1, false);
  }
}

// ---------- offseason ----------

/** End of season: expired deals → free agency (user gets message to re-sign via Bird rights before FA opens). */
export function expireContracts(s: GameState) {
  const next = seasonLabel(s.seasonYear + 1);
  for (const p of Object.values(s.players)) {
    if (!p.teamId || p.retired || !p.contract) continue;
    if (!p.contract.salaries.some((x) => x.season >= next)) {
      if (p.teamId === s.userTeamId) continue; // user decides in re-sign window
      // AI re-signs good-value players with Bird rights, lets others walk.
      const ask = askingPrice(s, p);
      const age = ageOf(p.birthDate, new Date(s.date));
      const keep = p.ratings.ovr >= 72 && age <= 33 && ask.amount <= marketValue(p, s.seasonYear) * 1.05;
      if (keep) p.contract = { ...p.contract, salaries: contractRows(s.seasonYear + 1, ask.amount, ask.years), type: 'standard' };
      else p.teamId = null;
    }
  }
}

/** One day of the offseason market: each AI team with cap room or needs makes at most one signing. */
export function offseasonMarketDay(s: GameState, day: number) {
  const rng = mulberry32(hashString(`${s.seed}|ofa|${s.season}|${day}`));
  const next = seasonLabel(s.seasonYear + 1);
  const pool = freeAgents(s).sort((a, b) => b.ratings.ovr - a.ratings.ovr);
  const teams = Object.keys(s.teams).filter((t) => t !== s.userTeamId).sort(() => rng() - 0.5);
  const cap = capNumbers(s.seasonYear + 1);
  for (const t of teams) {
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
