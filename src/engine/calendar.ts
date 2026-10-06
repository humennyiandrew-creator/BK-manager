// Season calendar moments for the NBA: the in-season Cup, All-Star weekend, trade deadline day and
// awards night (with Coach of the Year). Set up once per season, then driven day by day.
import type { Awards, BoxLine, CupGroup, CupRound, CupTie, Game, GameResult, GameState, Player } from './model';
import { addDays } from './schedule';
import { hashString, mulberry32, type Rng } from './rng';
import { standings } from './season';
import { pushNews, gameScore } from './news';
import { computeAwards } from './offseason';
import { aiAiTrade, strengthRanks } from './trade';
import { leagueStrength } from './cba';

const NBA = 'NBA';
const fullName = (p: Player) => `${p.firstName} ${p.lastName}`;
const isNba = (s: GameState, teamId: string) => (s.teams[teamId]?.league ?? NBA) === NBA;
const nbaTeams = (s: GameState) => Object.keys(s.teams).filter((t) => isNba(s, t));
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const ROUND_LABEL: Record<CupRound, string> = { qf: 'quarter-final', sf: 'semi-final', final: 'final' };
/** Prize money for the user's club by how far it went. */
const CUP_PRIZE = { champion: 2_500_000, final: 1_200_000, sf: 600_000, qf: 300_000 };

function msg(s: GameState, from: string, subject: string, body: string, kind: GameState['messages'][number]['kind'] = 'league') {
  s.messages.unshift({ id: s.nextId++, date: s.date, from, subject, body, read: false, kind });
}

// ---------- scheduling helpers ----------

type Busy = Map<string, Set<string>>;

function busyIndex(games: Game[]): Busy {
  const m: Busy = new Map();
  for (const g of games) {
    let set = m.get(g.date);
    if (!set) m.set(g.date, (set = new Set()));
    set.add(g.home).add(g.away);
  }
  return m;
}

const free = (busy: Busy, ids: string[], date: string) => ids.every((id) => !busy.get(date)?.has(id));

function moveGame(busy: Busy, g: Game, date: string) {
  busy.get(g.date)?.delete(g.home);
  busy.get(g.date)?.delete(g.away);
  g.date = date;
  let set = busy.get(date);
  if (!set) busy.set(date, (set = new Set()));
  set.add(g.home).add(g.away);
}

/** Next date from `from` (inclusive) where both teams are free and neither played the day before. */
function nextFreeDate(busy: Busy, ids: string[], from: string, limit = 40): string | null {
  for (let i = 0; i < limit; i++) {
    const d = addDays(from, i);
    if (free(busy, ids, d) && free(busy, ids, addDays(d, -1))) return d;
  }
  for (let i = 0; i < limit; i++) {
    const d = addDays(from, i);
    if (free(busy, ids, d)) return d;
  }
  return null;
}

/** Push any unplayed NBA regular-season game of these teams off `date`, to the next free day after `after`. */
function clearDate(s: GameState, busy: Busy, teams: string[], date: string, after: string) {
  for (const g of s.games) {
    if (g.date !== date || g.result || g.type !== 'regular' || (g.comp ?? NBA) !== NBA) continue;
    if (!teams.includes(g.home) && !teams.includes(g.away)) continue;
    const d = nextFreeDate(busy, [g.home, g.away], addDays(after, 1));
    if (d) moveGame(busy, g, d);
  }
}

// ---------- setup ----------

/** Builds this season's calendar: expected win shares, Cup groups and nights, All-Star dates and break. */
export function setupCalendar(s: GameState) {
  const teams = nbaTeams(s);
  const strength = leagueStrength(s);
  const sorted = [...teams].sort((a, b) => (strength.get(b)?.avg ?? 0) - (strength.get(a)?.avg ?? 0));
  const expected = Object.fromEntries(sorted.map((t, i) => [t, +(0.72 - (0.44 * i) / Math.max(1, sorted.length - 1)).toFixed(3)]));
  s.calendar = { season: s.season, expected, deadline: {} };
  if (teams.length < 20) return;
  const rng = mulberry32(hashString(`${s.seed}|calendar|${s.season}`));
  const busy = busyIndex(s.games);
  setupCup(s, rng, busy);
  setupAllStar(s, busy);
}

function setupCup(s: GameState, rng: Rng, busy: Busy) {
  const Y = s.seasonYear;
  const nights: string[] = [];
  for (let d = `${Y}-11-07`; d <= `${Y}-12-03`; d = addDays(d, 1)) if (weekday(d) === 2 || weekday(d) === 5) nights.push(d);
  const groups: CupGroup[] = [];
  for (const conf of ['East', 'West'] as const) {
    const list = nbaTeams(s).filter((t) => s.teams[t].conference === conf).sort(() => rng() - 0.5);
    for (let i = 0; i < 3; i++) groups.push({ id: `${conf} ${'ABC'[i]}`, conf, teams: list.slice(i * 5, i * 5 + 5) });
  }
  groups.forEach((grp, gi) => {
    // Circle method on five teams plus a bye: five rounds, two games each, four games per team.
    const ids = [...grp.teams, 'BYE'];
    const rot = ids.slice(1);
    for (let r = 0; r < 5; r++) {
      const list = [ids[0], ...rot];
      for (let i = 0; i < 3; i++) {
        const a = list[i], b = list[5 - i];
        if (a === 'BYE' || b === 'BYE') continue;
        const pref = Math.min(nights.length - 1, Math.floor((r * nights.length) / 5) + (gi % 2));
        const candidates = s.games
          .filter((g) => !g.result && !g.cup && g.type === 'regular' && (g.comp ?? NBA) === NBA && ((g.home === a && g.away === b) || (g.home === b && g.away === a)))
          .sort((x, y) => Math.abs(Date.parse(x.date) - Date.parse(nights[pref])) - Math.abs(Date.parse(y.date) - Date.parse(nights[pref])));
        const g = candidates[0];
        if (!g) continue;
        busy.get(g.date)?.delete(a);
        busy.get(g.date)?.delete(b);
        let night: string | undefined;
        for (let k = 0; k < nights.length && !night; k++) {
          const d = nights[(pref + k) % nights.length];
          if (free(busy, [a, b], d)) night = d;
        }
        if (!night) {
          // Fall back to any free day in the group-stage window.
          for (let d = nights[0]; d <= nights[nights.length - 1] && !night; d = addDays(d, 1)) if (free(busy, [a, b], d)) night = d;
        }
        busy.get(g.date)?.add(a).add(b);
        if (!night) continue;
        moveGame(busy, g, night);
        g.cup = { group: grp.id };
      }
      rot.unshift(rot.pop()!);
    }
  });
  s.calendar!.cup = { season: s.season, groups, nights, knockout: [] };
  const mine = groups.find((g) => g.teams.includes(s.userTeamId));
  if (mine) {
    const others = mine.teams.filter((t) => t !== s.userTeamId).map((t) => s.teams[t].name).join(', ');
    msg(s, 'League Office', `NBA Cup draw: ${mine.id}`, `We are in ${mine.id} with the ${others}. Group games are played on Cup nights between ${nights[0]} and ${nights[nights.length - 1]} and count towards the regular season. Group winners and one wildcard per conference reach the knockouts, where every round pays prize money.`);
  }
}

function setupAllStar(s: GameState, busy: Busy) {
  const Y = s.seasonYear + 1;
  let game = `${Y}-02-14`;
  while (weekday(game) !== 0) game = addDays(game, 1);
  const breakStart = addDays(game, -2), breakEnd = addDays(game, 2);
  // Nobody plays during the break: move those games to the days after it.
  for (const g of s.games) {
    if (g.result || (g.comp ?? NBA) !== NBA || g.type !== 'regular' || g.date < breakStart || g.date > breakEnd) continue;
    const d = nextFreeDate(busy, [g.home, g.away], addDays(breakEnd, 1));
    if (d) moveGame(busy, g, d);
  }
  s.calendar!.allStar = { season: s.season, selectionDate: addDays(game, -17), breakStart, gameDate: game, breakEnd };
}

// ---------- NBA Cup ----------

export interface CupRow { teamId: string; w: number; l: number; pd: number; pf: number; gp: number }

export function cupGroupTable(s: GameState, group: CupGroup): CupRow[] {
  const rows = new Map(group.teams.map((t) => [t, { teamId: t, w: 0, l: 0, pd: 0, pf: 0, gp: 0 }]));
  for (const g of s.games) {
    if (g.cup?.group !== group.id || !g.result) continue;
    const h = rows.get(g.home), a = rows.get(g.away);
    if (!h || !a) continue;
    const hw = g.result.home > g.result.away;
    h.gp++; a.gp++;
    h.pf += g.result.home; a.pf += g.result.away;
    h.pd += g.result.home - g.result.away; a.pd += g.result.away - g.result.home;
    (hw ? h : a).w++; (hw ? a : h).l++;
  }
  return [...rows.values()].sort((x, y) => y.w - x.w || y.pd - x.pd || y.pf - x.pf);
}

const groupGames = (s: GameState) => s.games.filter((g) => g.cup?.group);
const tieGame = (s: GameState, t: CupTie) => s.games.find((g) => g.id === t.gameId);

function addTie(s: GameState, busy: Busy, round: CupRound, conf: 'East' | 'West' | null, high: string, low: string, date: string): CupTie {
  clearDate(s, busy, [high, low], date, addDays(date, 1));
  const g: Game = { id: s.nextId++, date, home: high, away: low, type: 'cup', cup: { round } };
  s.games.push(g);
  moveGame(busy, g, date);
  const tie: CupTie = { id: `${round}-${conf ?? 'final'}-${high}`, round, conf, high, low, gameId: g.id };
  s.calendar!.cup!.knockout.push(tie);
  return tie;
}

function cupDaily(s: GameState) {
  const cup = s.calendar?.cup;
  if (!cup || cup.champion) return;
  const busy = busyIndex(s.games);
  const user = s.userTeamId;
  const gg = groupGames(s);
  // Group stage complete → seed the knockout: three group winners and the best runner-up per conference.
  if (!cup.knockout.length && gg.length && gg.every((g) => g.result)) {
    const lastNight = gg.reduce((m, g) => (g.date > m ? g.date : m), '');
    const qfDate = addDays(lastNight, 6);
    for (const conf of ['East', 'West'] as const) {
      const tables = cup.groups.filter((g) => g.conf === conf).map((g) => cupGroupTable(s, g));
      const rank = (a: CupRow, b: CupRow) => b.w - a.w || b.pd - a.pd || b.pf - a.pf;
      const winners = tables.map((t) => t[0]).sort(rank);
      const wildcard = tables.map((t) => t[1]).sort(rank)[0];
      const seeds = [...winners, wildcard].map((r) => r.teamId);
      addTie(s, busy, 'qf', conf, seeds[0], seeds[3], qfDate);
      addTie(s, busy, 'qf', conf, seeds[1], seeds[2], addDays(qfDate, conf === 'East' ? 0 : 1));
    }
    const names = cup.knockout.map((t) => `${s.teams[t.high].abbr} v ${s.teams[t.low].abbr}`).join(', ');
    pushNews(s, { kind: 'cup', headline: 'NBA Cup quarter-finals set', body: names, tone: 'neutral' });
    const ours = cup.knockout.find((t) => t.high === user || t.low === user);
    if (ours) msg(s, 'League Office', 'Through to the NBA Cup knockouts', `We meet the ${s.teams[ours.high === user ? ours.low : ours.high].name} in the quarter-final on ${tieGame(s, ours)!.date}. Prize money grows every round.`);
    else if (isNba(s, user) && cup.groups.some((g) => g.teams.includes(user))) msg(s, 'League Office', 'Out of the NBA Cup', 'We did not make it out of the group. Focus returns to the regular season.');
    return;
  }
  // Resolve played ties, then schedule the next round.
  for (const t of cup.knockout) {
    const g = tieGame(s, t);
    if (!t.winner && g?.result) t.winner = g.result.home > g.result.away ? g.home : g.away;
  }
  const round = (r: CupRound) => cup.knockout.filter((t) => t.round === r);
  const qf = round('qf'), sf = round('sf'), fin = round('final');
  const better = (a: string, b: string): [string, string] => {
    const pct = (id: string) => standings(s, undefined, NBA).find((r) => r.teamId === id)?.pct ?? 0;
    return pct(a) >= pct(b) ? [a, b] : [b, a];
  };
  if (qf.length === 4 && qf.every((t) => t.winner) && !sf.length) {
    const date = addDays(s.date, 3);
    for (const conf of ['East', 'West'] as const) {
      const [a, b] = qf.filter((t) => t.conf === conf).map((t) => t.winner!);
      const [high, low] = better(a, b);
      addTie(s, busy, 'sf', conf, high, low, date);
    }
    pushNews(s, { kind: 'cup', headline: 'NBA Cup semi-finals in Las Vegas', body: round('sf').map((t) => `${s.teams[t.high].name} v ${s.teams[t.low].name}`).join(', '), tone: 'neutral' });
  } else if (sf.length === 2 && sf.every((t) => t.winner) && !fin.length) {
    const [high, low] = better(sf[0].winner!, sf[1].winner!);
    addTie(s, busy, 'final', null, high, low, addDays(s.date, 2));
    pushNews(s, { kind: 'cup', headline: `NBA Cup final: ${s.teams[high].name} v ${s.teams[low].name}`, tone: 'neutral' });
  } else if (fin.length && fin[0].winner) {
    finishCup(s, fin[0]);
  }
}

function finishCup(s: GameState, final: CupTie) {
  const cup = s.calendar!.cup!;
  cup.champion = final.winner;
  const champ = s.teams[final.winner!];
  const runner = s.teams[final.winner === final.high ? final.low : final.high];
  const mvp = cup.mvp ? s.players[cup.mvp] : undefined;
  pushNews(s, {
    kind: 'cup', teamId: champ.id, playerId: mvp?.id, tone: 'good',
    headline: `${champ.city} ${champ.name} win the NBA Cup`,
    body: `Beat the ${runner.name} in the final.${mvp ? ` ${fullName(mvp)} named Cup MVP.` : ''}`,
  });
  // The user's run pays out by the round it ended in.
  const u = s.userTeamId;
  const ties = cup.knockout.filter((t) => t.high === u || t.low === u);
  if (!ties.length) return;
  const last = ties[ties.length - 1];
  const prize = cup.champion === u ? CUP_PRIZE.champion : CUP_PRIZE[last.round];
  s.finance.cash += prize;
  s.finance.revenue.playoffs = (s.finance.revenue.playoffs ?? 0) + prize;
  if (cup.champion === u) {
    s.finance.hype = Math.min(100, (s.finance.hype ?? 50) + 8);
    s.board.confidence = Math.min(100, s.board.confidence + 6);
    for (const p of Object.values(s.players)) if (p.teamId === u) p.morale = Math.min(100, p.morale + 6);
    msg(s, 'Board of Directors', 'NBA Cup champions', `A trophy in December. The players earned ${(prize / 1e6).toFixed(1)}M in prize money for the club, and the fans are buzzing.`, 'board');
  } else {
    msg(s, 'Front Office', `NBA Cup run ends in the ${ROUND_LABEL[last.round]}`, `The run earned $${(prize / 1e6).toFixed(2)}M in prize money.`, 'finance');
  }
}

/** Called from applyResult while the box score still exists: the Cup MVP comes from the final. */
export function cupAfterGame(s: GameState, g: Game, res: GameResult) {
  if (g.cup?.round !== 'final' || !res.box || !s.calendar?.cup) return;
  const won = res.home > res.away ? res.box.home : res.box.away;
  const best = [...won].sort((a: BoxLine, b: BoxLine) => gameScore(b) - gameScore(a))[0];
  if (best) s.calendar.cup.mvp = best.id;
}

// ---------- All-Star weekend ----------

function allStarScore(s: GameState, p: Player, pct: Map<string, number>): number {
  const gp = p.season.gp;
  if (gp < 15) return -1;
  const pg = (k: keyof Player['season']) => p.season[k] / gp;
  const impact = pg('pts') + 0.5 * (pg('orb') + pg('drb')) + pg('ast') + 1.5 * (pg('stl') + pg('blk')) - pg('tov');
  return impact + (pct.get(p.teamId!) ?? 0.5) * 8 + p.ratings.ovr * 0.15;
}

function pickWeighted<T>(list: T[], weight: (x: T) => number, rng: Rng): T | undefined {
  const total = list.reduce((x, v) => x + Math.max(0, weight(v)), 0);
  let r = rng() * total;
  for (const v of list) { r -= Math.max(0, weight(v)); if (r <= 0) return v; }
  return list[0];
}

function allStarDaily(s: GameState) {
  const as = s.calendar?.allStar;
  if (!as) return;
  const u = s.userTeamId;
  if (s.date === as.selectionDate && !as.east) {
    const pct = new Map(standings(s, undefined, NBA).map((r) => [r.teamId, r.pct]));
    const pool = Object.values(s.players).filter((p) => p.teamId && isNba(s, p.teamId) && !p.retired);
    const pick = (conf: 'East' | 'West') => pool.filter((p) => s.teams[p.teamId!].conference === conf)
      .map((p) => ({ p, v: allStarScore(s, p, pct) })).filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v).slice(0, 12).map((x) => x.p.id);
    as.east = pick('East');
    as.west = pick('West');
    const all = [...as.east, ...as.west];
    pushNews(s, { kind: 'allstar', headline: 'All-Star rosters announced', body: `Starters: ${[...as.east.slice(0, 5), ...as.west.slice(0, 5)].map((id) => s.players[id].lastName).join(', ')}.`, tone: 'neutral' });
    const ours = all.filter((id) => s.players[id].teamId === u);
    for (const id of ours) s.players[id].morale = Math.min(100, s.players[id].morale + 8);
    if (ours.length) {
      s.finance.hype = Math.min(100, (s.finance.hype ?? 50) + 2 * ours.length);
      msg(s, 'League Office', ours.length === 1 ? 'An All-Star in the building' : `${ours.length} All-Stars in the building`, `${ours.map((id) => fullName(s.players[id])).join(', ')} ${ours.length === 1 ? 'has' : 'have'} been named to the All-Star team.`);
    }
    const snub = pool.filter((p) => p.teamId === u && p.ratings.ovr >= 80 && !all.includes(p.id)).sort((a, b) => b.ratings.ovr - a.ratings.ovr)[0];
    if (snub) {
      snub.morale = Math.max(0, snub.morale - 5);
      pushNews(s, { kind: 'allstar', playerId: snub.id, teamId: u, tone: 'bad', headline: `${fullName(snub)} snubbed for the All-Star game` });
    }
    return;
  }
  if (s.date === as.breakStart) {
    for (const p of Object.values(s.players)) if (p.teamId && isNba(s, p.teamId)) p.fatigue = Math.round((p.fatigue ?? 0) * 0.35);
    pushNews(s, { kind: 'allstar', headline: 'All-Star weekend begins', body: 'Five days off for everyone else: legs recover across the league.', tone: 'neutral' });
    return;
  }
  if (s.date === as.gameDate && as.east && !as.result) {
    const rng = mulberry32(hashString(`${s.seed}|allstar|${s.season}`));
    let east = 150 + Math.floor(rng() * 40), west = 150 + Math.floor(rng() * 40);
    if (east === west) east++;
    const winners = east > west ? as.east : as.west!;
    const pct = new Map(standings(s, undefined, NBA).map((r) => [r.teamId, r.pct]));
    const mvp = pickWeighted(winners, (id) => allStarScore(s, s.players[id], pct) ** 2, rng)!;
    const shooters = Object.values(s.players).filter((p) => p.teamId && isNba(s, p.teamId) && p.season.gp >= 15)
      .sort((a, b) => b.ratings.attrs.threePoint - a.ratings.attrs.threePoint).slice(0, 8);
    const dunkers = Object.values(s.players).filter((p) => p.teamId && isNba(s, p.teamId) && p.yearsPro <= 6)
      .sort((a, b) => (b.ratings.attrs.dunk + b.ratings.attrs.vertical) - (a.ratings.attrs.dunk + a.ratings.attrs.vertical)).slice(0, 6);
    const threes = pickWeighted(shooters, (p) => (p.ratings.attrs.threePoint - 60) ** 2, rng)!;
    const dunk = pickWeighted(dunkers, (p) => (p.ratings.attrs.dunk + p.ratings.attrs.vertical - 120) ** 2, rng)!;
    as.result = { east, west, mvp, threes: threes.id, dunk: dunk.id };
    const m = s.players[mvp];
    pushNews(s, { kind: 'allstar', playerId: mvp, teamId: m.teamId ?? undefined, tone: 'good', headline: `${east > west ? 'East' : 'West'} win the All-Star game ${Math.max(east, west)}–${Math.min(east, west)}`, body: `${fullName(m)} named All-Star MVP.` });
    pushNews(s, { kind: 'allstar', playerId: threes.id, teamId: threes.teamId ?? undefined, tone: 'good', headline: `${fullName(threes)} wins the three-point contest` });
    pushNews(s, { kind: 'allstar', playerId: dunk.id, teamId: dunk.teamId ?? undefined, tone: 'good', headline: `${fullName(dunk)} wins the slam dunk contest` });
    const ours = [m, threes, dunk].filter((p) => p.teamId === u);
    for (const p of ours) p.morale = Math.min(100, p.morale + 4);
    if (ours.length) msg(s, 'League Office', 'All-Star weekend honours', [m.teamId === u && `${fullName(m)} was All-Star MVP.`, threes.teamId === u && `${fullName(threes)} won the three-point contest.`, dunk.teamId === u && `${fullName(dunk)} won the dunk contest.`].filter(Boolean).join(' '));
  }
}

// ---------- trade deadline ----------

function deadlineDaily(s: GameState) {
  const cal = s.calendar!;
  const deadline = s.keyDates.tradeDeadline;
  if (s.date === addDays(deadline, -5) && !cal.deadline.warned) {
    cal.deadline.warned = true;
    const rng = mulberry32(hashString(`${s.seed}|rumours|${s.season}`));
    const ranks = strengthRanks(s);
    const sellers = nbaTeams(s).filter((t) => (ranks.get(t) ?? 15) >= 20 && t !== s.userTeamId);
    const buyers = nbaTeams(s).filter((t) => (ranks.get(t) ?? 15) <= 10 && t !== s.userTeamId);
    for (let i = 0; i < 3 && sellers.length && buyers.length; i++) {
      const seller = sellers[Math.floor(rng() * sellers.length)];
      const p = Object.values(s.players).filter((x) => x.teamId === seller && x.ratings.ovr >= 73).sort(() => rng() - 0.5)[0];
      const buyer = buyers[Math.floor(rng() * buyers.length)];
      if (p) pushNews(s, { kind: 'trade', playerId: p.id, teamId: seller, tone: 'neutral', headline: `Rumour: ${s.teams[buyer].name} calling about ${fullName(p)}`, body: `The ${s.teams[seller].name} are said to be listening.` });
    }
    if (isNba(s, s.userTeamId)) msg(s, 'Front Office', 'Trade deadline in five days', `The deadline is ${deadline}. Phones are ringing around the league: if we want to move, now is the time.`, 'trade');
  }
  if (s.date === deadline && !cal.deadline.done) {
    cal.deadline.done = true;
    const rng = mulberry32(hashString(`${s.seed}|deadline|${s.season}`));
    const ranks = strengthRanks(s);
    const deals: string[] = [];
    for (let i = 0; i < 16 && deals.length < 5; i++) {
      const d = aiAiTrade(s, rng, ranks);
      if (d) {
        const p = s.players[d.playerId];
        deals.push(`${fullName(p)} to the ${s.teams[d.buyer].name}`);
        pushNews(s, { kind: 'trade', playerId: p.id, teamId: d.buyer, tone: 'neutral', headline: `Deadline deal: ${fullName(p)} joins the ${s.teams[d.buyer].name}`, body: `The ${s.teams[d.seller].name} take back a package for the future.` });
      }
    }
    cal.deadline.trades = deals.length;
    pushNews(s, { kind: 'trade', tone: 'neutral', headline: deals.length ? `Deadline day: ${deals.length} deal${deals.length === 1 ? '' : 's'} done` : 'A quiet deadline day', body: deals.join('; ') || undefined });
    if (isNba(s, s.userTeamId)) msg(s, 'Front Office', 'Trade deadline has passed', deals.length ? `Around the league: ${deals.join('; ')}. Rosters are now set until the summer, apart from free agents.` : 'A quiet day around the league. Rosters are now set until the summer, apart from free agents.', 'trade');
  }
}

// ---------- awards night ----------

/** Coach of the Year: the NBA team that beat its preseason expectation by the most. */
export function coachOfTheYear(s: GameState): string | null {
  const exp = s.calendar?.expected ?? {};
  const rows = standings(s, undefined, NBA).filter((r) => r.w + r.l >= 40);
  const best = rows.map((r) => ({ id: r.teamId, v: r.pct - (exp[r.teamId] ?? 0.5) })).sort((a, b) => b.v - a.v)[0];
  return best?.id ?? null;
}

function awardsDaily(s: GameState) {
  const cal = s.calendar!;
  if (cal.awards) return;
  const regular = s.games.filter((g) => (g.comp ?? NBA) === NBA && g.type === 'regular');
  if (!regular.length || regular.some((g) => !g.result)) return;
  const result: Awards = { ...computeAwards(s, NBA), coy: coachOfTheYear(s) };
  cal.awards = { date: s.date, result };
  const u = s.userTeamId;
  const name = (id: string | null) => (id ? `${fullName(s.players[id])} (${s.teams[s.players[id].teamId!]?.abbr ?? 'FA'})` : 'Not awarded');
  const list: [string, string | null][] = [['Most Valuable Player', result.mvp], ['Defensive Player of the Year', result.dpoy], ['Rookie of the Year', result.roy], ['Sixth Man of the Year', result.sixth], ['Most Improved Player', result.mip]];
  for (const [label, id] of list) if (id) pushNews(s, { kind: 'award', playerId: id, teamId: s.players[id].teamId ?? undefined, tone: 'good', headline: `${label}: ${fullName(s.players[id])}` });
  if (result.coy) pushNews(s, { kind: 'award', teamId: result.coy, tone: 'good', headline: `Coach of the Year: ${result.coy === u ? 'you' : `the ${s.teams[result.coy].name}' head coach`}` });
  for (const [, id] of list) if (id && s.players[id].teamId === u) s.players[id].morale = Math.min(100, s.players[id].morale + 6);
  if (result.coy === u) {
    s.manager.reputation = Math.min(100, s.manager.reputation + 6);
    s.board.confidence = Math.min(100, s.board.confidence + 6);
  }
  if (isNba(s, u)) {
    const lines = [...list.map(([label, id]) => `${label}: ${name(id)}`), `Coach of the Year: ${result.coy === u ? 'you' : result.coy ? `${s.teams[result.coy].city} ${s.teams[result.coy].name}` : 'Not awarded'}`];
    msg(s, 'League Office', `${s.season} awards night`, lines.join('\n'));
  }
}

// ---------- driver ----------

/** Once per sim day, after the day's games. */
export function calendarDaily(s: GameState) {
  if (!s.calendar || s.calendar.season !== s.season) return;
  cupDaily(s);
  allStarDaily(s);
  deadlineDaily(s);
  awardsDaily(s);
}

/** A short label for a calendar moment falling on `date`, for the UI. */
export function momentOn(s: GameState, date: string): string | null {
  const c = s.calendar;
  if (!c) return null;
  const as = c.allStar;
  if (as) {
    if (date === as.selectionDate) return 'All-Star selection';
    if (date === as.gameDate) return 'All-Star game';
    if (date >= as.breakStart && date <= as.breakEnd) return 'All-Star break';
  }
  if (date === s.keyDates.tradeDeadline) return 'Trade deadline';
  if (c.cup?.nights.includes(date)) return 'Cup night';
  return null;
}

/** "NBA Cup, East B" / "NBA Cup quarter-final" for a game, or null. */
export function cupLabel(g: Game): string | null {
  if (g.cup?.group) return `NBA Cup, ${g.cup.group}`;
  if (g.cup?.round) return `NBA Cup ${ROUND_LABEL[g.cup.round]}`;
  return null;
}
