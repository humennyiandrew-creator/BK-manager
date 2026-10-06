// Sponsor match objectives (F1 Manager-style): before every game our partners set side goals —
// "make 15 threes", "hold them under 105", "Tatum scores 30" — with cash and fan-hype rewards.
// Built a few days out (so the hub can show them), tracked live in the match, settled on the result.
import type { BoxLine, Game, GameResult, GameState, MatchObjective, ObjectiveStat, Player } from './model';
import { hashString, mulberry32, type Rng } from './rng';
import { daysBetween } from './schedule';
import { clamp, teamStrength } from './mgmt/market';
import { BRAND_GLOBAL, BRAND_LOCAL, BRAND_NATIONAL } from './sponsors';
import { rivalryStakes } from './rivalries';

// ---------- evaluation (shared by settlement and the live match tracker) ----------

export interface ObjSide { lines: BoxLine[]; pts: number }
export interface ObjCtx { us: ObjSide; them: ObjSide }

export function objectiveValue(o: MatchObjective, c: ObjCtx): number {
  const sum = (k: keyof BoxLine) => c.us.lines.reduce((a, l) => a + (l[k] as number), 0);
  const line = o.playerId ? c.us.lines.find((l) => l.id === o.playerId) : undefined;
  switch (o.stat) {
    case 'win': return c.us.pts > c.them.pts ? 1 : 0;
    case 'margin': return c.us.pts - c.them.pts;
    case 'oppPts': return c.them.pts;
    case 'threes': return sum('tpm');
    case 'rebounds': return sum('orb') + sum('drb');
    case 'turnovers': return sum('tov');
    case 'assists': return sum('ast');
    case 'bench': return c.us.lines.filter((l) => !l.starter).reduce((a, l) => a + l.pts, 0);
    case 'steals': return sum('stl');
    case 'blocks': return sum('blk');
    case 'fgPct': { const fga = sum('fga'); return fga ? Math.round((sum('fgm') / fga) * 1000) / 10 : 0; }
    case 'playerPts': return line?.pts ?? 0;
    case 'playerReb': return line ? line.orb + line.drb : 0;
    case 'playerAst': return line?.ast ?? 0;
  }
}

export const objectiveMet = (o: MatchObjective, v: number) => (o.under ? v <= o.target : v >= o.target);

const BANKED: ObjectiveStat[] = ['threes', 'rebounds', 'assists', 'bench', 'steals', 'blocks', 'playerPts', 'playerReb', 'playerAst'];

/** Live status. Counting stats bank once reached; "or fewer" stats are lost once exceeded. */
export function objectiveStatus(o: MatchObjective, v: number, final: boolean): 'met' | 'failed' | 'on' | 'off' {
  const ok = objectiveMet(o, v);
  if (final) return ok ? 'met' : 'failed';
  if (o.under) return ok ? 'on' : 'failed';
  if (ok && BANKED.includes(o.stat)) return 'met';
  return ok ? 'on' : 'off';
}

// ---------- generation ----------

interface PerGame { pts: number; opp: number; tpm: number; reb: number; ast: number; tov: number; stl: number; blk: number; bench: number; fg: number }
const LEAGUE_AVG: Record<string, PerGame> = {
  NBA: { pts: 114, opp: 114, tpm: 13, reb: 44, ast: 27, tov: 14, stl: 8, blk: 5, bench: 36, fg: 47 },
  EL: { pts: 81, opp: 81, tpm: 9, reb: 35, ast: 18, tov: 12, stl: 6.5, blk: 2.8, bench: 26, fg: 47 },
};

const roster = (s: GameState, teamId: string) => Object.values(s.players).filter((p) => p.teamId === teamId && !p.retired);

/** Team per-game profile, shrunk toward the league average early in the season. */
function perGame(s: GameState, teamId: string): PerGame {
  const lg = LEAGUE_AVG[s.teams[teamId].league ?? 'NBA'] ?? LEAGUE_AVG.NBA;
  const games = s.games.filter((g) => g.result && g.type === 'regular' && (g.home === teamId || g.away === teamId));
  const n = games.length;
  if (!n) return lg;
  const ps = roster(s, teamId);
  const tot = (k: keyof Player['season']) => ps.reduce((a, p) => a + p.season[k], 0);
  const pts = games.reduce((a, g) => a + (g.home === teamId ? g.result!.home : g.result!.away), 0) / n;
  const opp = games.reduce((a, g) => a + (g.home === teamId ? g.result!.away : g.result!.home), 0) / n;
  const fga = tot('fga');
  const own: PerGame = {
    pts, opp, tpm: tot('tpm') / n, reb: (tot('orb') + tot('drb')) / n, ast: tot('ast') / n, tov: tot('tov') / n,
    stl: tot('stl') / n, blk: tot('blk') / n, bench: ps.filter((p) => p.season.gs < p.season.gp / 2).reduce((a, p) => a + p.season.pts, 0) / n,
    fg: fga ? (tot('fgm') / fga) * 100 : lg.fg,
  };
  const w = n / (n + 6);
  return Object.fromEntries(Object.keys(lg).map((k) => [k, own[k as keyof PerGame] * w + lg[k as keyof PerGame] * (1 - w)])) as unknown as PerGame;
}

type Draft = Omit<MatchObjective, 'id' | 'sponsor' | 'reward' | 'hype'> & { diff: number; w: number };

function candidates(s: GameState, g: Game): Draft[] {
  const us = s.userTeamId, oppId = g.home === us ? g.away : g.home;
  const opp = s.teams[oppId];
  const mine = perGame(s, us), theirs = perGame(s, oppId);
  const euro = (s.teams[us].league ?? 'NBA') !== 'NBA';
  const edge = teamStrength(s, us) - teamStrength(s, oppId);
  const healthy = roster(s, us).filter((p) => !p.injury && p.season.gp > 0);
  const per = (p: Player, k: keyof Player['season']) => p.season[k] / Math.max(1, p.season.gp);
  const best = (f: (p: Player) => number) => [...healthy].sort((a, b) => f(b) - f(a))[0];
  const out: Draft[] = [
    { stat: 'win', target: 1, label: `Beat the ${opp.name}`, diff: edge >= 2 ? 0.8 : edge <= -2 ? 1.6 : 1.1, w: 1.2 },
    { stat: 'oppPts', target: Math.round(theirs.pts - (euro ? 4 : 6)), under: true, label: `Hold ${opp.abbr} to ${Math.round(theirs.pts - (euro ? 4 : 6))} or fewer`, diff: 1.5, w: 1 },
    { stat: 'threes', target: Math.round(mine.tpm + 2), label: `Make ${Math.round(mine.tpm + 2)}+ threes`, diff: 1.3, w: 1 },
    { stat: 'rebounds', target: Math.round(mine.reb + 3), label: `Grab ${Math.round(mine.reb + 3)}+ rebounds`, diff: 1.3, w: 0.9 },
    { stat: 'assists', target: Math.round(mine.ast + 3), label: `Dish ${Math.round(mine.ast + 3)}+ assists`, diff: 1.3, w: 0.9 },
    { stat: 'turnovers', target: Math.max(5, Math.round(mine.tov - 3)), under: true, label: `${Math.max(5, Math.round(mine.tov - 3))} turnovers or fewer`, diff: 1.4, w: 0.9 },
    { stat: 'bench', target: Math.round(mine.bench + 6), label: `Bench scores ${Math.round(mine.bench + 6)}+`, diff: 1.3, w: 0.7 },
    { stat: 'steals', target: Math.round(mine.stl + 2.5), label: `Record ${Math.round(mine.stl + 2.5)}+ steals`, diff: 1.3, w: 0.6 },
    { stat: 'blocks', target: Math.round(mine.blk + 2.5), label: `Block ${Math.round(mine.blk + 2.5)}+ shots`, diff: 1.3, w: 0.5 },
    { stat: 'fgPct', target: Math.round(mine.fg + 3), label: `Shoot ${Math.round(mine.fg + 3)}%+ from the field`, diff: 1.4, w: 0.7 },
  ];
  if (edge >= 1) out.push({ stat: 'margin', target: euro ? 8 : 12, label: `Win by ${euro ? 8 : 12}+`, diff: 1.6, w: 0.9 });
  const scorer = best((p) => per(p, 'pts') + (p.arc?.revealed && p.arc.kind === 'breakout' ? 6 : 0) + (p.form ?? 0) * 2);
  if (scorer) {
    const t = Math.max(euro ? 12 : 15, Math.round(per(scorer, 'pts') + 5));
    out.push({ stat: 'playerPts', playerId: scorer.id, target: t, label: `${scorer.lastName} scores ${t}+`, diff: 1.5, w: 1.3 });
  }
  const glass = best((p) => per(p, 'orb') + per(p, 'drb'));
  if (glass && glass !== scorer) {
    const t = Math.max(euro ? 7 : 8, Math.round(per(glass, 'orb') + per(glass, 'drb') + 4));
    out.push({ stat: 'playerReb', playerId: glass.id, target: t, label: `${glass.lastName} grabs ${t}+ rebounds`, diff: 1.5, w: 0.8 });
  }
  const dime = best((p) => per(p, 'ast'));
  if (dime && dime !== scorer && dime !== glass) {
    const t = Math.max(euro ? 5 : 6, Math.round(per(dime, 'ast') + 4));
    out.push({ stat: 'playerAst', playerId: dime.id, target: t, label: `${dime.lastName} dishes ${t}+ assists`, diff: 1.5, w: 0.8 });
  }
  return out;
}

function draw(list: Draft[], rng: Rng): Draft {
  let r = rng() * list.reduce((a, d) => a + d.w, 0);
  for (const d of list) if ((r -= d.w) <= 0) return d;
  return list[list.length - 1];
}

/** Partners in priority order: signed deals first (bigger tiers pay more), then local walk-ins. */
function partners(s: GameState, rng: Rng): { name: string; mul: number }[] {
  const signed = (s.finance.sponsors ?? []).map((d) => ({ name: d.name, mul: d.tier === 'global' ? 2.2 : d.tier === 'national' ? 1.5 : 1 }));
  const extra = [...BRAND_LOCAL, ...BRAND_NATIONAL.slice(0, 2), ...BRAND_GLOBAL.slice(0, 1)]
    .filter((n) => !signed.some((x) => x.name === n))
    .sort(() => rng() - 0.5)
    .map((name) => ({ name, mul: 1 }));
  return [...signed.sort((a, b) => b.mul - a.mul), ...extra];
}

/** Three objectives for the user's next game (built up to 3 days out, or for a specific game on demand). */
export function buildMatchObjectives(s: GameState, game?: Game): void {
  const g = game ?? s.games
    .filter((x) => !x.result && (x.home === s.userTeamId || x.away === s.userTeamId))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!g || s.manager?.unemployed) return;
  if (!game && daysBetween(s.date, g.date) > 3) return;
  if (s.matchObjectives?.gameId === g.id) return;
  const rng = mulberry32(hashString(`${s.seed}|objectives|${g.id}`));
  const pool = candidates(s, g);
  const chosen: Draft[] = [];
  while (chosen.length < 3 && pool.length) {
    const d = draw(pool, rng);
    pool.splice(pool.indexOf(d), 1);
    // Don't stack near-duplicates: one result goal, one per individual player.
    if ((d.stat === 'margin' || d.stat === 'win') && chosen.some((c) => c.stat === 'margin' || c.stat === 'win')) continue;
    chosen.push(d);
  }
  // Partners pay more for playoff and Cup games, and for nights against a rival.
  const big = (g.type !== 'regular' ? 1.6 : 1) * rivalryStakes(s, g);
  const sponsors = partners(s, rng);
  s.matchObjectives = {
    gameId: g.id,
    list: chosen.map(({ diff, w: _w, ...d }, i) => {
      const sp = sponsors[i % sponsors.length];
      return {
        ...d, id: `${g.id}-${i}`, sponsor: sp.name,
        reward: Math.round((90_000 * diff * sp.mul * big) / 10_000) * 10_000,
        hype: g.type !== 'regular' ? 2 : 1,
      };
    }),
  };
}

/** Settle on the final: pay rewards, nudge hype, log it, tell the user. */
export function settleMatchObjectives(s: GameState, g: Game, res: GameResult): void {
  const set = s.matchObjectives;
  if (!set || set.gameId !== g.id || set.settled || !res.box) return;
  const home = g.home === s.userTeamId;
  const ctx: ObjCtx = {
    us: { lines: home ? res.box.home : res.box.away, pts: home ? res.home : res.away },
    them: { lines: home ? res.box.away : res.box.home, pts: home ? res.away : res.home },
  };
  let earned = 0, met = 0, hype = 0;
  for (const o of set.list) {
    const value = objectiveValue(o, ctx);
    const ok = objectiveMet(o, value);
    o.result = { value, met: ok };
    if (ok) { met++; earned += o.reward; hype += o.hype; }
  }
  set.settled = true;
  const f = s.finance;
  f.cash += earned;
  f.revenue.sponsors += earned;
  f.hype = clamp((f.hype ?? 50) + hype - (met === 0 ? 1 : 0), 0, 100);
  s.objectiveLog = [{ gameId: g.id, date: s.date, met, total: set.list.length, earned }, ...(s.objectiveLog ?? [])].slice(0, 40);
  const lines = set.list.map((o) => `${o.result!.met ? '✓' : '✗'} ${o.label} (${o.sponsor}) — ${o.stat === 'fgPct' ? `${o.result!.value}%` : o.result!.value}`);
  s.messages.unshift({
    id: s.nextId++, date: s.date, from: 'Partnerships', read: false, kind: 'finance',
    subject: `Sponsor objectives: ${met}/${set.list.length} met${earned ? ` (+$${(earned / 1e3).toFixed(0)}K)` : ''}`,
    body: lines.join('\n'),
  });
}
