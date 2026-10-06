// Day loop: sim games, stats, injuries, standings, play-in, playoffs.
import type { BoxLine, Game, GameResult, GameState, Phase, Player, Series, StatLine } from './model';
import { addDays } from './schedule';
import { hashString, mulberry32 } from './rng';
import { refreshRotation } from './rotation';
import { simGame } from './sim/fast';
import { leagueOf } from './leagues';
import { elRegularDone, elStartPostseason, elTick } from './postseason-el';
import { dailyUpdate } from './daily';
import { boardOnPhase } from './mgmt/board';
import { fatigueInjuryMul, trainingEffects } from './progression';
import { clamp } from './mgmt/market';
import { hasNode } from './mgmt/facilities';
import { offseasonStep } from './offseason';
import { eventsDaily } from './events';
import { settleMatchObjectives } from './objectives';
import { newsAfterGame, newsInjury } from './news';
import { cupAfterGame } from './calendar';
import { rivalriesAfterGame, rivalriesSeasonEnd } from './rivalries';

// ---------- standings ----------

export interface StandingRow {
  teamId: string; w: number; l: number; pct: number; gb: number;
  home: [number, number]; away: [number, number]; conf: [number, number];
  pf: number; pa: number; streak: number; last10: [number, number];
}

/** Table for one competition (default the user's league) and optionally one conference. */
export function standings(s: GameState, conference?: string, comp?: string): StandingRow[] {
  const league = comp ?? s.teams[s.userTeamId]?.league ?? 'NBA';
  const rows = new Map<string, StandingRow & { log: boolean[] }>();
  for (const t of Object.values(s.teams)) {
    if ((t.league ?? 'NBA') !== league) continue;
    if (conference && t.conference !== conference) continue;
    rows.set(t.id, { teamId: t.id, w: 0, l: 0, pct: 0, gb: 0, home: [0, 0], away: [0, 0], conf: [0, 0], pf: 0, pa: 0, streak: 0, last10: [0, 0], log: [] });
  }
  const h2h = new Map<string, number>();
  for (const g of s.games) {
    if (g.type !== 'regular' || !g.result || (g.comp ?? 'NBA') !== league) continue;
    const homeWon = g.result.home > g.result.away;
    const sameConf = s.teams[g.home].conference === s.teams[g.away].conference;
    for (const [id, won, pf, pa, isHome] of [[g.home, homeWon, g.result.home, g.result.away, true], [g.away, !homeWon, g.result.away, g.result.home, false]] as const) {
      const r = rows.get(id);
      if (!r) continue;
      r[won ? 'w' : 'l']++;
      r.pf += pf; r.pa += pa;
      (isHome ? r.home : r.away)[won ? 0 : 1]++;
      if (sameConf) r.conf[won ? 0 : 1]++;
      r.log.push(won);
    }
    const winner = homeWon ? g.home : g.away, loser = homeWon ? g.away : g.home;
    h2h.set(`${winner}|${loser}`, (h2h.get(`${winner}|${loser}`) ?? 0) + 1);
  }
  const list = [...rows.values()];
  for (const r of list) {
    r.pct = r.w + r.l ? r.w / (r.w + r.l) : 0;
    const last = r.log.at(-1);
    let n = 0;
    for (let i = r.log.length - 1; i >= 0 && r.log[i] === last; i--) n++;
    r.streak = last === undefined ? 0 : last ? n : -n;
    const l10 = r.log.slice(-10);
    r.last10 = [l10.filter(Boolean).length, l10.filter((x) => !x).length];
  }
  list.sort((a, b) =>
    b.pct - a.pct ||
    (h2h.get(`${b.teamId}|${a.teamId}`) ?? 0) - (h2h.get(`${a.teamId}|${b.teamId}`) ?? 0) ||
    (b.pf - b.pa) - (a.pf - a.pa));
  const lead = list[0];
  for (const r of list) r.gb = lead ? ((lead.w - r.w) + (r.l - lead.l)) / 2 : 0;
  return list.map(({ log: _log, ...r }) => r);
}

// ---------- results ----------

function addLine(to: StatLine, b: BoxLine) {
  if (!b.gp) return;
  for (const k of Object.keys(to) as (keyof StatLine)[]) to[k] += b[k];
}

const INJURIES: [string, number, number, number][] = [
  // name, weight, minDays, maxDays
  ['Ankle sprain', 30, 2, 12], ['Knee soreness', 20, 1, 6], ['Hamstring strain', 14, 5, 20], ['Back spasms', 10, 2, 8],
  ['Concussion', 5, 7, 14], ['Calf strain', 8, 8, 25], ['Broken finger', 5, 14, 35], ['Torn meniscus', 4, 30, 70],
  ['Fractured foot', 2, 45, 100], ['Torn ACL', 1, 220, 320], ['Illness', 12, 1, 4],
];

function rollInjury(p: Player, minutes: number, rng: () => number, mul = 1): boolean {
  if (minutes <= 0 || rng() >= 0.0045 * mul * (minutes / 36) * (0.4 + p.ratings.injuryProne)) return false;
  let r = rng() * INJURIES.reduce((s, x) => s + x[1], 0);
  const inj = INJURIES.find((x) => (r -= x[1]) <= 0) ?? INJURIES[0];
  p.injury = { name: inj[0], daysLeft: Math.round(inj[2] + rng() * (inj[3] - inj[2])) };
  return true;
}

function msg(s: GameState, from: string, subject: string, body: string, kind: GameState['messages'][number]['kind']) {
  s.messages.unshift({ id: s.nextId++, date: s.date, from, subject, body, read: false, kind });
}

export function applyResult(s: GameState, g: Game, res: GameResult) {
  const rng = mulberry32(hashString(`${s.seed}|inj|${g.id}`));
  const isUser = g.home === s.userTeamId || g.away === s.userTeamId;
  const injMul = { [g.home]: trainingEffects(s, g.home).injuryMul, [g.away]: trainingEffects(s, g.away).injuryMul };
  for (const b of [...res.box!.home, ...res.box!.away]) {
    const p = s.players[b.id];
    addLine(g.type === 'regular' || g.type === 'cup' ? p.season : p.playoffs, b);
    const loadMgmt = p.teamId && hasNode(s, p.teamId, 'analytics_loadMgmt');
    p.fatigue = clamp((p.fatigue ?? 0) + b.min * 0.35 * (loadMgmt ? 0.85 : 1), 0, 100);
    if (rollInjury(p, b.min, rng, (injMul[p.teamId!] ?? 1) * fatigueInjuryMul(p))) {
      refreshRotation(s.teams[p.teamId!], s.players);
      newsInjury(s, p);
      if (p.teamId === s.userTeamId) {
        msg(s, 'Medical Staff', `${p.firstName} ${p.lastName} injured`, `${p.injury!.name}. Expected out ${p.injury!.daysLeft} days.`, 'injury');
      }
    }
  }
  newsAfterGame(s, g, res);
  cupAfterGame(s, g, res);
  rivalriesAfterGame(s, g, res);
  g.result = isUser ? res : { home: res.home, away: res.away, periods: res.periods };
  if (isUser) {
    const us = g.home === s.userTeamId;
    const opp = s.teams[us ? g.away : g.home];
    const won = us ? res.home > res.away : res.away > res.home;
    const score = us ? `${res.home}-${res.away}` : `${res.away}-${res.home}`;
    msg(s, 'Assistant Coach', `${won ? 'Win' : 'Loss'} ${us ? 'vs' : '@'} ${opp.abbr} ${score}`, `Final${res.periods.length > 4 ? ` (${res.periods.length - 4}OT)` : ''}: ${score}.`, 'result');
    settleMatchObjectives(s, g, res);
  }
  if (g.seriesId) updateSeries(s, g);
}

export function playGame(s: GameState, g: Game) {
  const rng = mulberry32(hashString(`${s.seed}|game|${g.id}`));
  const league = leagueOf(g.comp ?? s.teams[g.home].league);
  applyResult(s, g, simGame(s.teams[g.home], s.teams[g.away], s.players, rng, { ...league.rules, possSec: league.possSec }));
}

// ---------- postseason ----------

function newSeries(s: GameState, partial: Omit<Series, 'winsHigh' | 'winsLow'>) {
  s.series.push({ ...partial, winsHigh: 0, winsLow: 0 });
}

function updateSeries(s: GameState, g: Game) {
  const se = s.series.find((x) => x.id === g.seriesId)!;
  const homeWon = g.result!.home > g.result!.away;
  const winner = homeWon ? g.home : g.away;
  if (winner === se.high) se.winsHigh++; else se.winsLow++;
  const need = Math.ceil(se.bestOf / 2);
  if (se.winsHigh >= need) se.winner = se.high;
  if (se.winsLow >= need) se.winner = se.low;
}

const loserOf = (se: Series) => (se.winner === se.high ? se.low : se.high);
const record = (s: GameState) => new Map(standings(s).map((r) => [r.teamId, r.pct]));

function startPlayIn(s: GameState) {
  s.phase = 'playin';
  for (const conf of ['East', 'West'] as const) {
    const t = standings(s, conf).map((r) => r.teamId);
    newSeries(s, { id: `PI-${conf}-7v8`, kind: 'playin', round: 0, conf, high: t[6], low: t[7], bestOf: 1 });
    newSeries(s, { id: `PI-${conf}-9v10`, kind: 'playin', round: 0, conf, high: t[8], low: t[9], bestOf: 1 });
  }
  msg(s, 'League Office', 'Regular season complete', 'The play-in tournament begins.', 'league');
}

function startPlayoffs(s: GameState) {
  s.phase = 'playoffs';
  for (const conf of ['East', 'West'] as const) {
    const top = standings(s, conf).slice(0, 6).map((r) => r.teamId);
    const get = (id: string) => s.series.find((x) => x.id === `PI-${conf}-${id}`)!.winner!;
    const seeds = [...top, get('7v8'), get('8th')];
    const pairs: [number, number, string][] = [[0, 7, 'A'], [3, 4, 'B'], [2, 5, 'C'], [1, 6, 'D']];
    for (const [h, l, slot] of pairs) {
      newSeries(s, { id: `R1-${conf}-${slot}`, kind: 'playoff', round: 1, conf, high: seeds[h], low: seeds[l], bestOf: 7, slot });
    }
  }
  msg(s, 'League Office', 'Playoffs begin', 'The first round is set.', 'league');
}

/** Called at end of each postseason day: create follow-up series and next games. */
function postseasonTick(s: GameState) {
  const pct = record(s);
  const better = (a: string, b: string): [string, string] => ((pct.get(a) ?? 0) >= (pct.get(b) ?? 0) ? [a, b] : [b, a]);
  // Only the NBA bracket: other competitions (EuroLeague) run their own postseason alongside.
  const nba = () => s.series.filter((x) => (x.comp ?? 'NBA') === 'NBA');
  if (s.phase === 'playin') {
    for (const conf of ['East', 'West'] as const) {
      const s78 = s.series.find((x) => x.id === `PI-${conf}-7v8`)!;
      const s910 = s.series.find((x) => x.id === `PI-${conf}-9v10`)!;
      if (s78.winner && s910.winner && !s.series.some((x) => x.id === `PI-${conf}-8th`)) {
        newSeries(s, { id: `PI-${conf}-8th`, kind: 'playin', round: 0, conf, high: loserOf(s78), low: s910.winner, bestOf: 1 });
      }
    }
    if (nba().filter((x) => x.kind === 'playin').length === 6 && nba().every((x) => x.kind !== 'playin' || x.winner)) startPlayoffs(s);
  }
  if (s.phase === 'playoffs') {
    for (let round = 1; round <= 3; round++) {
      const done = nba().filter((x) => x.round === round);
      if (!done.length || done.some((x) => !x.winner) || nba().some((x) => x.round === round + 1)) continue;
      if (round < 3) {
        for (const conf of ['East', 'West'] as const) {
          const bySlot = (slot: string) => done.find((x) => x.conf === conf && x.slot === slot)!.winner!;
          const next = round === 1 ? [['A', 'B', 'AB'], ['C', 'D', 'CD']] : [['AB', 'CD', 'F']];
          for (const [x, y, slot] of next) {
            const [high, low] = better(bySlot(x), bySlot(y));
            newSeries(s, { id: `R${round + 1}-${conf}-${slot}`, kind: 'playoff', round: round + 1, conf, high, low, bestOf: 7, slot });
          }
        }
      } else {
        const [high, low] = better(done[0].winner!, done[1].winner!);
        newSeries(s, { id: 'Finals', kind: 'playoff', round: 4, conf: null, high, low, bestOf: 7 });
      }
    }
    const finals = nba().find((x) => x.round === 4);
    if (finals?.winner) {
      s.champion = finals.winner;
      s.phase = 'offseason';
      const t = s.teams[finals.winner];
      msg(s, 'League Office', `${t.city} ${t.name} win the championship`, `${t.name} beat ${s.teams[loserOf(finals)].name} ${Math.max(finals.winsHigh, finals.winsLow)}-${Math.min(finals.winsHigh, finals.winsLow)}.`, 'league');
      return;
    }
  }
  // Schedule next game for every live series without a pending game.
  for (const se of nba()) {
    if (se.winner || s.games.some((g) => g.seriesId === se.id && !g.result)) continue;
    const n = se.winsHigh + se.winsLow + 1;
    const highHome = se.bestOf === 1 || [1, 2, 5, 7].includes(n);
    s.games.push({
      id: s.nextId++, date: addDays(s.date, se.kind === 'playin' ? 1 : 2),
      home: highHome ? se.high : se.low, away: highHome ? se.low : se.high,
      type: se.kind === 'playin' ? 'playin' : 'playoff', seriesId: se.id,
    });
  }
}

// ---------- day loop ----------

export const userGameToday = (s: GameState) =>
  s.games.find((g) => g.date === s.date && !g.result && (g.home === s.userTeamId || g.away === s.userTeamId));

/** Sim every unplayed game today (optionally skipping the user's, which the live sim plays), then move to tomorrow. */
export function advanceDay(s: GameState, skipUserGame = false) {
  if (s.phase === 'offseason') return;
  if (s.phase === 'preseason' && s.games.some((g) => g.date === s.date)) s.phase = 'regular';
  const phaseBefore = s.phase;
  const played: Game[] = [];
  for (const g of s.games) {
    if (g.date !== s.date) continue;
    if (g.result) { played.push(g); continue; } // user's live game already applied today
    if (skipUserGame && (g.home === s.userTeamId || g.away === s.userTeamId)) continue;
    playGame(s, g);
    played.push(g);
  }
  // Heal
  const healed = new Set<string>();
  for (const p of Object.values(s.players)) {
    if (!p.injury) continue;
    if (--p.injury.daysLeft <= 0) {
      p.injury = null;
      if (p.teamId) healed.add(p.teamId);
      if (p.teamId === s.userTeamId) msg(s, 'Medical Staff', `${p.firstName} ${p.lastName} cleared`, 'Available for selection.', 'injury');
    }
  }
  healed.forEach((id) => refreshRotation(s.teams[id], s.players));

  const userLeague = s.teams[s.userTeamId].league ?? 'NBA';
  if (userLeague === 'NBA') {
    if (s.phase === 'regular' && s.games.every((g) => (g.comp ?? 'NBA') !== 'NBA' || g.type !== 'regular' || g.result)) startPlayIn(s);
    if (s.phase === 'playin' || s.phase === 'playoffs') postseasonTick(s);
  } else if (elRegularDone(s)) {
    if (s.phase === 'regular') { s.phase = 'playin'; elStartPostseason(s); }
    if (s.phase === 'playin' || s.phase === 'playoffs') {
      elTick(s);
      if (s.series.some((x) => x.comp === 'EL' && x.round === 1)) s.phase = 'playoffs';
      if (s.elChampion) { s.champion = s.elChampion; s.phase = 'offseason'; }
    }
  }
  // Competitions the user is not in still run their own postseason quietly.
  if (userLeague !== 'EL' && elRegularDone(s)) { elStartPostseason(s); elTick(s); }
  dailyUpdate(s, played);
  if (phaseBefore === 'regular' && s.phase !== 'regular') rivalriesSeasonEnd(s);
  if (s.phase !== phaseBefore) boardOnPhase(s);
  s.date = addDays(s.date, 1);
}

/** "Continue" button: play through to the next day the user has a game (stops at start of that day). */
export function continueGame(s: GameState, maxDays = 60) {
  if (s.phase === 'offseason') { offseasonStep(s); eventsDaily(s); return; }
  if (userGameToday(s)) { advanceDay(s); return; }
  for (let i = 0; i < maxDays && (s.phase as Phase) !== 'offseason'; i++) {
    advanceDay(s);
    if (userGameToday(s)) return;
  }
}

export function simToEndOfSeason(s: GameState) {
  for (let i = 0; i < 400 && s.phase !== 'offseason'; i++) advanceDay(s);
}
