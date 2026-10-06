// Rivalries, F1 24 style: clubs and players build heat game by game through three tiers
// (regular, heated, career-defining). Beating a rival pays out in hype, board confidence and
// reputation; the stakes grow with the tier. Players who win their duels grow from it.
import type { BoxLine, ClubRivalry, Game, GameResult, GameState, Player, PlayerRivalry, RivalTier } from './model';
import { pushNews, gameScore } from './news';
import { leagueStrength } from './cba';
import { clamp } from './mgmt/market';

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`;
const MAX_CLUBS = 3;

export const tierOf = (heat: number): RivalTier => (heat >= 75 ? 'defining' : heat >= 40 ? 'heated' : 'regular');
export const TIER_LABEL: Record<RivalTier, string> = { regular: 'Rivalry', heated: 'Heated rivalry', defining: 'Career-defining rivalry' };
const TIER_N: Record<RivalTier, number> = { regular: 1, heated: 2, defining: 3 };

function msg(s: GameState, subject: string, body: string) {
  s.messages.unshift({ id: s.nextId++, date: s.date, from: 'Assistant Coach', subject, body, read: false, kind: 'other' });
}

const rivals = (s: GameState) => (s.rivals ??= { season: s.season, clubs: [], players: [], acclaim: 0 });
export const clubRival = (s: GameState, teamId: string) => s.rivals?.clubs.find((r) => r.teamId === teamId);
export const playerRival = (s: GameState, playerId: string) => s.rivals?.players.find((r) => r.playerId === playerId);

function addClub(s: GameState, teamId: string, reason: string, heat: number) {
  const R = rivals(s);
  const have = R.clubs.find((r) => r.teamId === teamId);
  if (have) { have.heat = Math.max(have.heat, heat); have.reason = reason; return; }
  R.clubs.push({ teamId, heat, reason, since: s.season, season: { w: 0, l: 0 }, allTime: { w: 0, l: 0 } });
  R.clubs.sort((a, b) => b.heat - a.heat);
  if (R.clubs.length > MAX_CLUBS) R.clubs.length = MAX_CLUBS;
}

/** Start of each season: cool last year's heat, settle who our rivals are now. */
export function setupRivalries(s: GameState) {
  const R = rivals(s);
  const user = s.teams[s.userTeamId];
  const fresh = R.season !== s.season;
  R.season = s.season;
  for (const c of R.clubs) { if (fresh) c.heat = Math.round(c.heat * 0.7); c.season = { w: 0, l: 0 }; }
  for (const p of R.players) { if (fresh) p.heat = Math.round(p.heat * 0.7); p.season = { w: 0, l: 0 }; }
  R.clubs = R.clubs.filter((c) => s.teams[c.teamId] && (s.teams[c.teamId].league ?? 'NBA') === (user.league ?? 'NBA'));

  // A local rival: the closest club in strength from our division (or league abroad).
  if (!R.clubs.length || R.clubs.every((c) => c.reason !== 'Division rival' && c.reason !== 'League rival')) {
    const str = leagueStrength(s);
    const mine = str.get(user.id)?.avg ?? 70;
    const nba = (user.league ?? 'NBA') === 'NBA';
    const pool = Object.values(s.teams).filter((t) => t.id !== user.id && (t.league ?? 'NBA') === (user.league ?? 'NBA') && (nba ? t.division === user.division : true));
    const pick = pool.sort((a, b) => Math.abs((str.get(a.id)?.avg ?? 70) - mine) - Math.abs((str.get(b.id)?.avg ?? 70) - mine))[0];
    if (pick) addClub(s, pick.id, nba ? 'Division rival' : 'League rival', 25);
  }
  // And a contender to measure ourselves against: the nearest club in strength elsewhere in the conference.
  if (R.clubs.length < 2 && (user.league ?? 'NBA') === 'NBA') {
    const str = leagueStrength(s);
    const mine = str.get(user.id)?.avg ?? 70;
    const pick = Object.values(s.teams)
      .filter((t) => t.id !== user.id && (t.league ?? 'NBA') === 'NBA' && t.conference === user.conference && !R.clubs.some((c) => c.teamId === t.id))
      .sort((a, b) => Math.abs((str.get(a.id)?.avg ?? 70) - mine) - Math.abs((str.get(b.id)?.avg ?? 70) - mine))[0];
    if (pick) addClub(s, pick.id, 'Conference rival', 15);
  }

  // Player rivals for our two best players: the best player at the same position elsewhere in our conference.
  R.players = R.players.filter((r) => s.players[r.playerId]?.teamId === user.id && s.players[r.rivalId]?.teamId && s.players[r.rivalId].teamId !== user.id);
  const ours = Object.values(s.players).filter((p) => p.teamId === user.id && p.ratings.ovr >= 76).sort((a, b) => b.ratings.ovr - a.ratings.ovr).slice(0, 2);
  for (const p of ours) {
    if (R.players.some((r) => r.playerId === p.id)) continue;
    const taken = new Set(R.players.map((r) => r.rivalId));
    const cand = Object.values(s.players)
      .filter((q) => q.teamId && q.teamId !== user.id && !taken.has(q.id) && (s.teams[q.teamId].league ?? 'NBA') === (user.league ?? 'NBA')
        && q.positions[0] === p.positions[0] && q.ratings.ovr >= p.ratings.ovr - 4)
      .sort((a, b) => (s.teams[b.teamId!].conference === user.conference ? 1 : 0) - (s.teams[a.teamId!].conference === user.conference ? 1 : 0) || Math.abs(a.ratings.ovr - p.ratings.ovr) - Math.abs(b.ratings.ovr - p.ratings.ovr))[0];
    if (cand) R.players.push({ playerId: p.id, rivalId: cand.id, heat: 20, reason: `Best ${p.positions[0]} in the ${s.teams[cand.teamId!].conference === user.conference ? 'conference' : 'league'}`, since: s.season, season: { w: 0, l: 0 }, allTime: { w: 0, l: 0 } });
  }
}

function heatUp<T extends ClubRivalry | PlayerRivalry>(s: GameState, r: T, add: number, name: string, teamId?: string, playerId?: string) {
  const before = tierOf(r.heat);
  r.heat = clamp(r.heat + add, 0, 100);
  const after = tierOf(r.heat);
  if (after !== before && TIER_N[after] > TIER_N[before]) {
    pushNews(s, { kind: 'rivalry', teamId, playerId, tone: 'neutral', headline: `${name}: now a ${TIER_LABEL[after].toLowerCase()}` });
    msg(s, `${TIER_LABEL[after]}: ${name}`, after === 'defining'
      ? 'This one will be talked about for years. Wins here count for far more with the fans, the board and the league.'
      : 'Things are heating up. Beating them now matters more to the fans and the board, and losing hurts more.');
  }
}

/** After every game involving our club, while the box score exists. */
export function rivalriesAfterGame(s: GameState, g: Game, res: GameResult) {
  const R = s.rivals;
  if (!R) return;
  const u = s.userTeamId;
  if (g.home !== u && g.away !== u) return;
  const home = g.home === u;
  const opp = home ? g.away : g.home;
  const mine = home ? res.home : res.away, theirs = home ? res.away : res.home;
  const won = mine > theirs, margin = Math.abs(mine - theirs);
  const playoff = g.type === 'playoff' || g.type === 'playin';

  const c = R.clubs.find((r) => r.teamId === opp);
  if (c) {
    const t = TIER_N[tierOf(c.heat)];
    c.season[won ? 'w' : 'l']++;
    c.allTime[won ? 'w' : 'l']++;
    heatUp(s, c, 10 + (margin <= 5 ? 5 : 0) + (res.periods.length > 4 ? 4 : 0) + (margin >= 20 ? 4 : 0) + (playoff ? 12 : 0), `${s.teams[opp].city} ${s.teams[opp].name}`, opp);
    s.finance.hype = clamp((s.finance.hype ?? 50) + (won ? t : -t), 0, 100);
    s.board.confidence = clamp(s.board.confidence + (won ? t : -t), 0, 100);
    if (won) {
      R.acclaim += t * (playoff ? 2 : 1);
      s.manager.reputation = clamp(s.manager.reputation + (t >= 2 ? 0.5 * t : 0), 0, 100);
    }
  }

  // Player duels: the better game score takes the duel.
  if (res.box) {
    const lines = new Map<string, BoxLine>([...res.box.home, ...res.box.away].map((l) => [l.id, l]));
    for (const r of R.players) {
      const a = lines.get(r.playerId), b = lines.get(r.rivalId);
      if (!a || !b || a.min < 10 || b.min < 10) continue;
      const ga = gameScore(a), gb = gameScore(b);
      const win = ga >= gb;
      r.season[win ? 'w' : 'l']++;
      r.allTime[win ? 'w' : 'l']++;
      const p = s.players[r.playerId], q = s.players[r.rivalId];
      heatUp(s, r, 9 + (ga >= 20 && gb >= 20 ? 5 : 0) + (playoff ? 8 : 0), `${fullName(p)} v ${fullName(q)}`, p.teamId ?? undefined, p.id);
      const t = TIER_N[tierOf(r.heat)];
      p.morale = clamp(p.morale + (win ? 2 + t : -1 - t), 0, 100);
      p.form = clamp((p.form ?? 0) + (win ? 0.15 * t : -0.1 * t), -3, 3);
    }
  }
  // Losing a playoff series to someone makes them a rival.
  if (g.seriesId) {
    const se = s.series.find((x) => x.id === g.seriesId);
    if (se?.winner && se.winner === opp && (se.high === u || se.low === u)) addClub(s, opp, 'Knocked us out of the playoffs', 45);
  }
}

/** End of the regular season: whoever won the season series collects. */
export function rivalriesSeasonEnd(s: GameState) {
  const R = s.rivals;
  if (!R || R.season !== s.season) return;
  for (const c of R.clubs) {
    if (!c.season.w && !c.season.l) continue;
    const t = TIER_N[tierOf(c.heat)];
    const team = s.teams[c.teamId];
    if (c.season.w > c.season.l) {
      s.manager.reputation = clamp(s.manager.reputation + t, 0, 100);
      R.acclaim += 2 * t;
      pushNews(s, { kind: 'rivalry', teamId: s.userTeamId, tone: 'good', headline: `Season series over the ${team.name} goes to the ${s.teams[s.userTeamId].name}`, body: `${c.season.w}–${c.season.l} this season.` });
    } else if (c.season.l > c.season.w) {
      s.board.confidence = clamp(s.board.confidence - t, 0, 100);
    }
  }
  for (const r of R.players) {
    const p = s.players[r.playerId];
    if (!p || p.teamId !== s.userTeamId || r.season.w + r.season.l < 2) continue;
    if (r.season.w > r.season.l && tierOf(r.heat) !== 'regular') {
      // Winning a heated duel over a season sharpens a player.
      p.ratings.ovr = Math.min(99, p.ratings.ovr + 1);
      p.ratings.pot = Math.max(p.ratings.pot, p.ratings.ovr);
      pushNews(s, { kind: 'rivalry', playerId: p.id, teamId: p.teamId ?? undefined, tone: 'good', headline: `${fullName(p)} wins his duel with ${fullName(s.players[r.rivalId])}`, body: `${r.season.w}–${r.season.l} head to head this season.` });
    }
  }
}

/** Heat fades slowly when rivals don't meet. Mondays. */
export function rivalriesWeekly(s: GameState) {
  const R = s.rivals;
  if (!R || new Date(`${s.date}T00:00:00Z`).getUTCDay() !== 1) return;
  for (const c of R.clubs) c.heat = Math.max(10, +(c.heat - 0.6).toFixed(1));
  for (const p of R.players) p.heat = Math.max(5, +(p.heat - 0.6).toFixed(1));
}

/** Sponsor and crowd stakes for a game: 1 normal, higher for rivals. */
export function rivalryStakes(s: GameState, g: Game): number {
  const opp = g.home === s.userTeamId ? g.away : g.home;
  const c = clubRival(s, opp);
  return c ? 1 + 0.15 * TIER_N[tierOf(c.heat)] : 1;
}
