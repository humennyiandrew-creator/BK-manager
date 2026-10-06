// League wire: storylines that make the world feel alive (breakouts, big nights, streaks, rankings).
// Kept separate from the inbox so the user's mail isn't flooded; capped and newest first.
import type { BoxLine, Game, GameResult, GameState, NewsItem, Player } from './model';
import { standings } from './season';
import { clamp, teamStrength } from './mgmt/market';

const MAX_NEWS = 60;
const fullName = (p: Player) => `${p.firstName} ${p.lastName}`;

export function pushNews(s: GameState, item: Omit<NewsItem, 'id' | 'date'>): NewsItem {
  if (!s.news) s.news = [];
  const n: NewsItem = { id: s.nextId++, date: s.date, ...item };
  s.news.unshift(n);
  if (s.news.length > MAX_NEWS) s.news.length = MAX_NEWS;
  return n;
}

/** Hollinger game score for one box line. */
export function gameScore(l: BoxLine): number {
  return l.pts + 0.4 * l.fgm - 0.7 * l.fga - 0.4 * (l.fta - l.ftm) + 0.7 * l.orb + 0.3 * l.drb + l.stl + 0.7 * l.ast + 0.7 * l.blk - 0.4 * l.pf - l.tov;
}

const compOf = (s: GameState, teamId: string) => s.teams[teamId]?.league ?? 'NBA';

// ---------- per game ----------

/** Called for every completed game while its box score still exists. */
export function newsAfterGame(s: GameState, g: Game, res: GameResult) {
  if (!res.box) return;
  const euro = (g.comp ?? 'NBA') !== 'NBA';
  const weekly = (s.weekly ??= {});
  let best: { l: BoxLine; teamId: string; oppId: string; text: string; rank: number } | null = null;
  for (const [lines, teamId, oppId] of [[res.box.home, g.home, g.away], [res.box.away, g.away, g.home]] as const) {
    for (const l of lines) {
      if (!l.gp) continue;
      const reb = l.orb + l.drb;
      const w = (weekly[l.id] ??= { g: 0, score: 0, pts: 0, reb: 0, ast: 0 });
      w.g++; w.score += gameScore(l); w.pts += l.pts; w.reb += reb; w.ast += l.ast;
      const tens = [l.pts, reb, l.ast, l.stl, l.blk].filter((x) => x >= 10).length;
      const big = euro ? 30 : 40;
      let text = '', rank = 0;
      if (l.pts >= big) { text = `drops ${l.pts} on`; rank = l.pts; }
      if (tens >= 3) { text = `posts a triple-double (${l.pts}/${reb}/${l.ast}) against`; rank = Math.max(rank, 45); }
      if (l.pts >= 20 && reb >= 20) { text = `goes for ${l.pts} and ${reb} against`; rank = Math.max(rank, 44); }
      if (text && (!best || rank > best.rank)) best = { l, teamId, oppId, text, rank };
    }
  }
  if (best) {
    const p = s.players[best.l.id];
    const won = (best.teamId === g.home) === (res.home > res.away);
    pushNews(s, {
      kind: 'performance', tone: 'good', teamId: best.teamId, playerId: p.id,
      headline: `${fullName(p)} ${best.text} ${s.teams[best.oppId].abbr}`,
      body: `${s.teams[best.teamId].name} ${won ? 'won' : 'lost'} ${Math.max(res.home, res.away)}-${Math.min(res.home, res.away)}.`,
    });
  }
}

/** A star (or one of ours) goes down for a while. */
export function newsInjury(s: GameState, p: Player) {
  if (!p.injury || !p.teamId) return;
  if (p.ratings.ovr < 84 || p.injury.daysLeft < 10) return;
  const weeks = Math.max(1, Math.round(p.injury.daysLeft / 7));
  pushNews(s, {
    kind: 'injury', tone: 'bad', teamId: p.teamId, playerId: p.id,
    headline: `${fullName(p)} (${s.teams[p.teamId].abbr}) out ~${weeks} week${weeks === 1 ? '' : 's'}`,
    body: `${p.injury.name}. A big blow for the ${s.teams[p.teamId].name}.`,
  });
}

// ---------- power rankings ----------

const z = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length)) || 1;
  return (x: number) => (x - m) / sd;
};

/** Results-driven ranking that leans on roster strength until enough games are played. */
export function computePowerRankings(s: GameState, comp: string): string[] {
  const rows = standings(s, undefined, comp);
  if (!rows.length) return [];
  const str = new Map(rows.map((r) => [r.teamId, teamStrength(s, r.teamId)]));
  const gp = (r: (typeof rows)[number]) => r.w + r.l;
  const zs = z(rows.map((r) => str.get(r.teamId)!));
  const zw = z(rows.map((r) => r.pct));
  const zn = z(rows.map((r) => (gp(r) ? (r.pf - r.pa) / gp(r) : 0)));
  const zl = z(rows.map((r) => (r.last10[0] + r.last10[1] ? r.last10[0] / (r.last10[0] + r.last10[1]) : 0.5)));
  const score = (r: (typeof rows)[number]) => {
    const w = gp(r) / (gp(r) + 10);
    const net = gp(r) ? (r.pf - r.pa) / gp(r) : 0;
    const l10 = r.last10[0] + r.last10[1] ? r.last10[0] / (r.last10[0] + r.last10[1]) : 0.5;
    return (1 - w) * zs(str.get(r.teamId)!) + w * (zw(r.pct) * 0.45 + zn(net) * 0.4 + zl(l10) * 0.15);
  };
  return [...rows].sort((a, b) => score(b) - score(a)).map((r) => r.teamId);
}

function weeklyRankings(s: GameState) {
  const comps = [...new Set(Object.values(s.teams).map((t) => t.league ?? 'NBA'))];
  const prev = s.powerRankings?.ranks ?? {};
  const ranks: Record<string, string[]> = {};
  for (const c of comps) ranks[c] = computePowerRankings(s, c);
  s.powerRankings = { date: s.date, ranks, prev };
  const mine = compOf(s, s.userTeamId);
  const now = ranks[mine], before = prev[mine];
  if (!now?.length || !before?.length) return;
  const movers = now.map((id, i) => ({ id, i, d: before.indexOf(id) - i })).filter((x) => x.d !== 0);
  if (now[0] !== before[0]) {
    pushNews(s, { kind: 'rankings', tone: 'neutral', teamId: now[0], headline: `Power Rankings: ${s.teams[now[0]].name} take over #1`, body: `${s.teams[before[0]].name} slip to #${now.indexOf(before[0]) + 1}.` });
    return;
  }
  const big = movers.sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
  if (big && Math.abs(big.d) >= 4) {
    pushNews(s, {
      kind: 'rankings', tone: big.d > 0 ? 'good' : 'bad', teamId: big.id,
      headline: `Power Rankings: ${s.teams[big.id].name} ${big.d > 0 ? 'climb' : 'tumble'} ${Math.abs(big.d)} spots to #${big.i + 1}`,
    });
  }
}

// ---------- player of the week ----------

function playerOfWeek(s: GameState) {
  const weekly = s.weekly ?? {};
  s.weekly = {};
  const groups = new Map<string, string[]>();
  for (const [id, w] of Object.entries(weekly)) {
    const p = s.players[id];
    if (!p?.teamId || w.g < 2) continue;
    const t = s.teams[p.teamId];
    const key = (t.league ?? 'NBA') === 'NBA' ? `NBA-${t.conference}` : t.league!;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(id);
  }
  for (const [key, ids] of groups) {
    const id = ids.sort((a, b) => weekly[b].score / weekly[b].g - weekly[a].score / weekly[a].g)[0];
    const p = s.players[id], w = weekly[id];
    const label = key.startsWith('NBA-') ? `${key.slice(4)} Player of the Week` : 'MVP of the Round';
    const line = `${(w.pts / w.g).toFixed(1)} pts, ${(w.reb / w.g).toFixed(1)} reb, ${(w.ast / w.g).toFixed(1)} ast over ${w.g} games`;
    pushNews(s, { kind: 'award', tone: 'good', teamId: p.teamId!, playerId: id, headline: `${label}: ${fullName(p)} (${s.teams[p.teamId!].abbr})`, body: line });
    if (p.teamId === s.userTeamId) {
      p.morale = clamp(p.morale + 5, 0, 100);
      s.finance.hype = clamp((s.finance.hype ?? 50) + 2, 0, 100);
      s.messages.unshift({ id: s.nextId++, date: s.date, from: 'League Office', subject: `${fullName(p)} named ${label}`, body: `${line}. His morale and the fans' excitement are up.`, read: false, kind: 'league' });
    }
  }
}

// ---------- daily ----------

const STREAK_MARKS = new Set([7, 10, 13, 16, 20, -8, -12, -16]);

export function newsDaily(s: GameState, playedToday: Game[]) {
  if (s.phase === 'offseason' || s.phase === 'preseason') return;
  // Streak milestones for teams that played today.
  const teamsToday = new Set(playedToday.filter((g) => g.type === 'regular').flatMap((g) => [g.home, g.away]));
  if (teamsToday.size) {
    const comps = new Set([...teamsToday].map((t) => compOf(s, t)));
    for (const c of comps) for (const r of standings(s, undefined, c)) {
      if (!teamsToday.has(r.teamId) || !STREAK_MARKS.has(r.streak)) continue;
      const t = s.teams[r.teamId];
      pushNews(s, {
        kind: 'streak', tone: r.streak > 0 ? 'good' : 'bad', teamId: t.id,
        headline: r.streak > 0 ? `${t.city} ${t.name} have won ${r.streak} straight` : `${t.city} ${t.name} have lost ${-r.streak} in a row`,
        body: `They sit at ${r.w}-${r.l}.`,
      });
    }
  }
  // AI trades make the wire.
  for (const tx of s.transactions) {
    if (tx.date !== s.date) break;
    if (tx.kind === 'trade' && !tx.teams.includes(s.userTeamId)) pushNews(s, { kind: 'other', tone: 'neutral', teamId: tx.teams[0], headline: 'Trade: ' + tx.text });
  }
  // Mondays: power rankings + player of the week.
  if (new Date(`${s.date}T00:00:00Z`).getUTCDay() === 1) {
    weeklyRankings(s);
    playerOfWeek(s);
  }
}

// ---------- award races (read-only ladders for the UI) ----------

export interface RaceRow { id: string; score: number; line: string }
export interface AwardRaces { mvp: RaceRow[]; roy: RaceRow[]; dpoy: RaceRow[]; sixth: RaceRow[] }

export function awardRaces(s: GameState, comp?: string, n = 5): AwardRaces {
  const league = comp ?? compOf(s, s.userTeamId);
  const table = standings(s, undefined, league);
  const pct = new Map(table.map((r) => [r.teamId, r.pct]));
  const teamGames = Math.max(1, ...table.map((r) => r.w + r.l));
  const pool = Object.values(s.players).filter((p) => p.teamId && compOf(s, p.teamId) === league && p.season.gp >= Math.max(1, teamGames * 0.4));
  const pg = (p: Player, k: keyof Player['season']) => p.season[k] / Math.max(1, p.season.gp);
  const impact = (p: Player) => pg(p, 'pts') + 0.5 * (pg(p, 'orb') + pg(p, 'drb')) + pg(p, 'ast') + 1.5 * (pg(p, 'stl') + pg(p, 'blk')) - pg(p, 'tov');
  const line = (p: Player) => `${pg(p, 'pts').toFixed(1)} / ${(pg(p, 'orb') + pg(p, 'drb')).toFixed(1)} / ${pg(p, 'ast').toFixed(1)}`;
  const dline = (p: Player) => `${pg(p, 'stl').toFixed(1)} stl · ${pg(p, 'blk').toFixed(1)} blk`;
  const top = (list: Player[], f: (p: Player) => number, l: (p: Player) => string) =>
    list.map((p) => ({ id: p.id, score: f(p), line: l(p) })).sort((a, b) => b.score - a.score).slice(0, n);
  const a = (p: Player) => p.ratings.attrs;
  return {
    mvp: top(pool, (p) => impact(p) + (pct.get(p.teamId!) ?? 0.5) * 20, line),
    roy: top(pool.filter((p) => p.yearsPro === 0), impact, line),
    dpoy: top(pool, (p) => 2 * (pg(p, 'stl') + pg(p, 'blk')) + 0.4 * pg(p, 'drb') + (a(p).helpD + a(p).perimeterD + a(p).interiorD) / 30 + (pct.get(p.teamId!) ?? 0.5) * 5, dline),
    sixth: top(pool.filter((p) => p.season.gs < p.season.gp / 2), (p) => pg(p, 'pts') + 0.3 * impact(p), line),
  };
}
