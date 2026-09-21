// Offseason loop: awards/history → lottery → draft → options + re-sign window → free agency → camp → new season.
// Driven one step per "Continue" via offseasonStep(). Career ends after s.maxSeasons seasons.
import type { Awards, GameState, Player, SeasonRecord } from './model';
import { emptyLine } from './model';
import { capNumbers, contractRows, isTwoWay, marketValue, minSalary, rosterOf, salaryIn, seasonLabel } from './cba';
import { ageOf } from './ratings';
import { hashString, mulberry32 } from './rng';
import { refreshRotation } from './rotation';
import { addDays, buildSchedule } from './schedule';
import { standings } from './season';
import { addPickYear, aiPick, draftUntilUser, generateDraftClass, nextPick, runLottery } from './draft';
import { askingPrice, expireContracts, freeAgents, offseasonMarketDay, releasePlayer } from './freeagency';
import { annualProgression } from './progression';
import { autoTactics } from './playbook/systems';
import { LONG_TERM, objectiveByRank, objectiveLabel } from './mgmt/board';
import { teamStrengthRank } from './mgmt/market';
import { euroTransferDaily } from './transfers-euro';
import { managerDaily } from './manager';

const FA_DAYS = 10;

function msg(s: GameState, from: string, subject: string, body: string, kind: GameState['messages'][number]['kind'] = 'league') {
  s.messages.unshift({ id: s.nextId++, date: s.date, from, subject, body, read: false, kind });
}
const fullName = (p: Player) => `${p.firstName} ${p.lastName}`;

// ---------- awards + season record ----------

export function computeAwards(s: GameState): Awards {
  const pct = new Map(standings(s).map((r) => [r.teamId, r.pct]));
  const pool = Object.values(s.players).filter((p) => p.teamId && p.season.gp >= 50);
  const pg = (p: Player, k: keyof Player['season']) => p.season[k] / p.season.gp;
  const impact = (p: Player) => pg(p, 'pts') + 0.5 * (pg(p, 'orb') + pg(p, 'drb')) + pg(p, 'ast') + 1.5 * (pg(p, 'stl') + pg(p, 'blk')) - pg(p, 'tov');
  const mvpScore = (p: Player) => impact(p) + (pct.get(p.teamId!) ?? 0.5) * 20;
  const byMvp = [...pool].filter((p) => p.season.gp >= 65).sort((a, b) => mvpScore(b) - mvpScore(a));
  const d = (p: Player) => 2 * (pg(p, 'stl') + pg(p, 'blk')) + 0.4 * pg(p, 'drb') + (p.ratings.attrs.helpD + p.ratings.attrs.perimeterD + p.ratings.attrs.interiorD) / 30 + (pct.get(p.teamId!) ?? 0.5) * 5;
  const best = (list: Player[], f: (p: Player) => number) => list.sort((a, b) => f(b) - f(a))[0]?.id ?? null;
  const rookies = Object.values(s.players).filter((p) => p.teamId && p.yearsPro === 0 && p.season.gp >= 40);
  const bench = pool.filter((p) => p.season.gs < p.season.gp / 2);
  const improved = pool.filter((p) => p.history[0] && p.history[0].gp >= 30);
  return {
    mvp: byMvp[0]?.id ?? pool[0].id,
    dpoy: best([...pool], d)!,
    roy: best(rookies, impact),
    sixth: best(bench, (p) => pg(p, 'pts')),
    mip: best(improved, (p) => pg(p, 'pts') - p.history[0].pts / p.history[0].gp),
    allNba: byMvp.slice(0, 15).map((p) => p.id),
  };
}

function userResult(s: GameState): string {
  const u = s.userTeamId;
  if (s.champion === u) return 'Champions';
  const mine = s.series.filter((x) => x.high === u || x.low === u);
  const last = mine[mine.length - 1];
  if (!last) return 'Missed playoffs';
  if (last.kind === 'playin') return 'Lost in Play-In';
  const names = ['', 'First Round', 'Conf Semifinals', 'Conf Finals', 'Finals'];
  const w = last.high === u ? last.winsHigh : last.winsLow, l = last.high === u ? last.winsLow : last.winsHigh;
  return `Lost ${names[last.round]} ${w}-${l}`;
}

function recordSeason(s: GameState) {
  const awards = computeAwards(s);
  const conf = s.teams[s.userTeamId].conference;
  const table = standings(s, conf);
  const row = table.find((r) => r.teamId === s.userTeamId)!;
  const mine = rosterOf(s, s.userTeamId).filter((p) => p.season.gp);
  const top = mine.sort((a, b) => b.season.pts / b.season.gp - a.season.pts / a.season.gp)[0];
  const last = s.board.history[s.board.history.length - 1];
  const rec: SeasonRecord = {
    season: s.season, w: row.w, l: row.l, confRank: table.indexOf(row) + 1, result: userResult(s),
    champion: s.champion!, awards, objective: objectiveLabel(s.board.objective), objectiveMet: last?.season === s.season ? last.met : false,
    topScorer: top ? { id: top.id, ppg: +(top.season.pts / top.season.gp).toFixed(1) } : { id: '', ppg: 0 },
  };
  s.history.push(rec);
  // Recognition feeds ratings: award winners carry confidence into next season.
  const bump = (id: string | null, ovr: number, pot: number) => {
    if (!id) return;
    const r = s.players[id].ratings;
    r.ovr = Math.min(99, r.ovr + ovr);
    r.pot = Math.min(99, Math.max(r.ovr, r.pot + pot));
  };
  bump(awards.mvp, 1, 1); bump(awards.roy, 1, 2); bump(awards.mip, 1, 2); bump(awards.dpoy, 0, 1);
  awards.allNba.slice(0, 5).forEach((id) => bump(id, 0, 1));
  const n = (id: string | null) => (id ? `${fullName(s.players[id])} (${s.teams[s.players[id].teamId!]?.abbr ?? 'FA'})` : '—');
  msg(s, 'League Office', `${s.season} awards`, `MVP: ${n(awards.mvp)}. DPOY: ${n(awards.dpoy)}. ROY: ${n(awards.roy)}. 6MOY: ${n(awards.sixth)}. MIP: ${n(awards.mip)}.`);
}

// ---------- re-sign window ----------

export const expiring = (s: GameState, teamId: string) => {
  const next = seasonLabel(s.seasonYear + 1);
  return rosterOf(s, teamId).filter((p) => p.contract && !p.contract.salaries.some((x) => x.season >= next));
};

/** Own free agent's ask: loyalty and happiness give a hometown discount. */
export function resignAsk(s: GameState, p: Player) {
  const base = askingPrice(s, p);
  const discount = (p.ratings.personality.loyalty / 20) * 0.1 + (p.morale - 60) / 400;
  return { amount: Math.max(minSalary(s.seasonYear + 1, p.yearsPro + 1), Math.round((base.amount * (1 - discount)) / 10_000) * 10_000), years: base.years };
}

/** Bird rights: user can go over the cap to keep own players. */
export function resignPlayer(s: GameState, pid: string, amount: number, years: number): string | null {
  const p = s.players[pid];
  if (s.offseason?.stage !== 'resign') return 'Re-sign window is closed';
  if (!p || p.teamId !== s.userTeamId || !expiring(s, s.userTeamId).includes(p)) return 'Not an expiring contract on your team';
  const ask = resignAsk(s, p);
  if (amount < ask.amount * 0.97) return `${p.lastName} wants at least $${(ask.amount / 1e6).toFixed(2)}M`;
  if (years < 1 || years > 5) return 'Contract length must be 1–5 years';
  commitResign(s, p, amount, years);
  return null;
}

/** Exported for negotiation.ts: commits a re-sign once terms are already agreed (bypasses the ask-price gate above). */
export function commitResign(s: GameState, p: Player, amount: number, years: number) {
  p.contract = { salaries: contractRows(s.seasonYear + 1, amount, years), type: 'standard' };
  s.transactions.unshift({ date: s.date, kind: 'extend', text: `${s.teams[p.teamId!].abbr} re-sign ${fullName(p)} (${years}y, $${(amount / 1e6).toFixed(1)}M)`, teams: [p.teamId!] });
}

/** Player options (opt out if underpaid) and team options (keep if fair value), all teams. */
function handleOptions(s: GameState) {
  const next = seasonLabel(s.seasonYear + 1);
  for (const p of Object.values(s.players)) {
    const o = p.contract?.option;
    if (!p.teamId || !o || o.season !== next) continue;
    const sal = salaryIn(p, next);
    const mv = marketValue(p, s.seasonYear + 1);
    const out = o.kind === 'player' ? mv > sal * 1.15 : mv < sal * 0.8;
    if (out) p.contract!.salaries = p.contract!.salaries.filter((x) => x.season < next);
    p.contract!.option = undefined;
    if (p.teamId === s.userTeamId) {
      msg(s, 'Front Office', `${o.kind === 'player' ? 'Player' : 'Team'} option: ${fullName(p)}`,
        o.kind === 'player' ? (out ? `${p.lastName} declined his option and will test free agency unless re-signed.` : `${p.lastName} picked up his $${(sal / 1e6).toFixed(1)}M option.`)
          : (out ? `We declined the $${(sal / 1e6).toFixed(1)}M team option on ${p.lastName}.` : `We exercised the team option on ${p.lastName}.`), 'trade');
    }
  }
}

// ---------- retirements + rollover ----------

function retirements(s: GameState) {
  const rng = mulberry32(hashString(`${s.seed}|retire|${s.season}`));
  for (const p of Object.values(s.players)) {
    if (p.retired || p.prospect) continue;
    const age = ageOf(p.birthDate, new Date(`${s.seasonYear + 1}-09-01`));
    const ovr = p.ratings.ovr;
    let prob = age >= 40 ? 1 : age >= 35 ? 0.25 + (age - 35) * 0.15 - (ovr - 70) * 0.03 : age >= 33 && ovr < 66 ? 0.4 : 0;
    if (!p.teamId && age >= 31 && ovr < 68) prob = Math.max(prob, 0.6);
    if (rng() >= prob) continue;
    const was = p.teamId;
    p.retired = true;
    p.teamId = null;
    p.contract = null;
    if (was) refreshRotation(s.teams[was], s.players);
    s.transactions.unshift({ date: s.date, kind: 'retire', text: `${fullName(p)} retires (age ${Math.floor(age)})`, teams: was ? [was] : [] });
    if (was === s.userTeamId || ovr >= 80) msg(s, 'League Office', `${fullName(p)} retires`, `${fullName(p)} has announced his retirement at ${Math.floor(age)}.`);
  }
}

/** AI rosters: trim to 15 standard, fill to 13 with minimum deals. */
function aiRosterFill(s: GameState) {
  const pool = freeAgents(s).sort((a, b) => b.ratings.ovr - a.ratings.ovr);
  for (const t of Object.keys(s.teams)) {
    if (t === s.userTeamId) continue;
    const std = () => rosterOf(s, t).filter((p) => !isTwoWay(p));
    while (std().length > 15) releasePlayer(s, std().sort((a, b) => a.ratings.ovr - b.ratings.ovr)[0].id);
    while (std().length < 13 && pool.length) {
      const p = pool.shift()!;
      p.teamId = t;
      p.contract = { salaries: contractRows(s.seasonYear + 1, minSalary(s.seasonYear + 1, p.yearsPro), 1), type: 'min' };
    }
  }
}

function newSeason(s: GameState) {
  const Y = s.seasonYear + 1;
  const label = seasonLabel(Y);
  for (const p of Object.values(s.players)) {
    if (p.season.gp && p.teamId !== undefined) {
      const l = p.season;
      p.history = [{ season: s.season, team: p.teamId ? s.teams[p.teamId].abbr : 'FA', gp: l.gp, gs: l.gs, min: l.min, pts: l.pts, orb: l.orb, drb: l.drb, ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov, pf: l.pf, fgm: l.fgm, fga: l.fga, tpm: l.tpm, tpa: l.tpa, ftm: l.ftm, fta: l.fta, usg: null, per: null, bpm: null, obpm: null, dbpm: null }, ...p.history].slice(0, 6);
    }
    if (p.season.gp > 0) p.yearsPro++; // drafted rookies stay at 0 for their rookie season
    p.season = emptyLine();
    p.playoffs = emptyLine();
    if (p.contract) p.contract.salaries = p.contract.salaries.filter((x) => x.season >= label);
    p.lastChange = 0;
  }
  s.seasonYear = Y;
  s.season = label;
  s.date = `${Y}-10-01`;
  s.phase = 'preseason';
  s.series = [];
  s.champion = undefined;
  s.draftOrder = [];
  s.tradeOffers = [];
  s.offseason = undefined;
  for (const t of Object.values(s.teams)) {
    t.mleUsed = false;
    t.deadCap = (t.deadCap ?? []).filter((d) => d.season >= label);
    refreshRotation(t, s.players);
    if (t.id !== s.userTeamId) autoTactics(t.tactics, rosterOf(s, t.id));
  }
  s.games = buildSchedule(Object.values(s.teams), Y, s.seed + Y, s.nextId);
  s.nextId += s.games.length + 1;
  s.keyDates = {
    tradeDeadline: `${Y + 1}-02-05`, regularEnd: s.games.reduce((m, g) => (g.date > m ? g.date : m), ''),
    draft: `${Y + 1}-06-24`, freeAgency: `${Y + 1}-06-30`,
  };
  addPickYear(s, Y + 5);
  generateDraftClass(s, Y + 1);
  // Finances + board for the new season.
  s.finance.revenue = { tickets: 0, tv: 0, merch: 0, sponsors: 0, playoffs: 0 };
  s.finance.expense = { salaries: 0, staff: 0, facilities: 0, tax: 0, operations: 0 };
  s.board.objective = objectiveByRank(teamStrengthRank(s, s.userTeamId));
  s.board.longTerm = LONG_TERM[s.board.objective];
  s.board.confidence = Math.round(s.board.confidence * 0.8 + 60 * 0.2);
  for (const st of s.staff) if (st.teamId && --st.years <= 0) st.years = 2; // auto-renew
  msg(s, 'Board of Directors', `${label} season objective`, `The board expects: ${objectiveLabel(s.board.objective)}.`, 'board');
}

// ---------- driver ----------

export function offseasonStageLabel(s: GameState): string {
  if (s.careerOver) return 'Career complete';
  const st = s.offseason?.stage;
  if (!st) return 'Season review';
  if (st === 'draft') return nextPick(s)?.owner === s.userTeamId ? 'On the clock' : 'Draft';
  if (st === 'resign') return 'Re-sign window';
  if (st === 'fa') return `Free agency day ${s.offseason!.faDay + 1}/${FA_DAYS}`;
  return 'Training camp';
}

/** One "Continue" in the offseason. */
export function offseasonStep(s: GameState) {
  if (s.phase !== 'offseason' || s.careerOver) return;
  // The summer market and the coaching carousel keep moving between stages.
  euroTransferDaily(s);
  managerDaily(s);
  if (!s.offseason) {
    recordSeason(s);
    if (s.seasonYear - s.startYear + 1 >= s.maxSeasons) {
      s.careerOver = true;
      msg(s, 'Board of Directors', 'Career complete', `Your ${s.maxSeasons}-season tenure is over. Thank you, coach.`, 'board');
      return;
    }
    if (!s.draftOrder.length) runLottery(s);
    s.date = s.keyDates.draft;
    s.offseason = { stage: 'draft', faDay: 0 };
    return;
  }
  const o = s.offseason;
  switch (o.stage) {
    case 'draft': {
      // A European club takes no part in the NBA draft: run it in the background and move on.
      if ((s.teams[s.userTeamId].league ?? 'NBA') !== 'NBA') {
        for (let i = 0; i < 80; i++) { const p = nextPick(s); if (!p) break; aiPick(s, p.id); }
      }
      const pending = nextPick(s);
      if (pending?.owner === s.userTeamId) {
        if (o.waitingPick === pending.id) aiPick(s, pending.id); // user skipped: auto-pick
        else { o.waitingPick = pending.id; return; }
      }
      const mine = draftUntilUser(s);
      if (mine) { o.waitingPick = mine.id; return; }
      // Draft over: undrafted prospects join the free-agent pool.
      for (const id of s.draftClass) { s.players[id].prospect = false; s.players[id].contract = null; }
      s.draftClass = [];
      handleOptions(s);
      expireContracts(s);
      s.date = addDays(s.keyDates.draft, 2);
      o.stage = 'resign';
      const exp = expiring(s, s.userTeamId);
      msg(s, 'Front Office', 'Re-sign window open', exp.length ? `Expiring: ${exp.map((p) => p.lastName).join(', ')}. Unsigned players hit free agency on July 1.` : 'No expiring contracts this summer.', 'trade');
      return;
    }
    case 'resign': {
      for (const p of expiring(s, s.userTeamId)) { p.teamId = null; p.contract = null; }
      refreshRotation(s.teams[s.userTeamId], s.players);
      s.date = `${s.seasonYear + 1}-07-01`;
      o.stage = 'fa';
      o.faDay = 0;
      msg(s, 'League Office', 'Free agency opens', `Cap for ${seasonLabel(s.seasonYear + 1)}: $${(capNumbers(s.seasonYear + 1).cap / 1e6).toFixed(1)}M.`);
      return;
    }
    case 'fa': {
      offseasonMarketDay(s, o.faDay);
      o.faDay++;
      s.date = addDays(s.date, 2);
      if (o.faDay >= FA_DAYS) { o.stage = 'camp'; s.date = `${s.seasonYear + 1}-09-25`; }
      return;
    }
    case 'camp': {
      annualProgression(s);
      retirements(s);
      aiRosterFill(s);
      newSeason(s);
      return;
    }
  }
}

/** Test/dev helper: run the whole offseason with auto-picks. */
export function simOffseason(s: GameState) {
  for (let i = 0; i < 200 && s.phase === 'offseason' && !s.careerOver; i++) offseasonStep(s);
}
