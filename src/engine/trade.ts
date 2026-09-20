// Trade valuation, AI acceptance, execution, AI–AI trades and AI offers to the user.
import type { DraftPick, GameState, Player, TradeOffer, TradeSide } from './model';
import { ageOf } from './ratings';
import { hashString, mulberry32, type Rng } from './rng';
import { capNumbers, capSeason, isTwoWay, leagueStrength, marketValue, payroll, rosterOf, salaryIn, tradeSalaryCheck, yearsLeft } from './cba';
import { releasePlayer } from './freeagency';
import { refreshRotation } from './rotation';
import { addDays } from './schedule';

// ---------- team context ----------

export function teamStrength(s: GameState, teamId: string): number {
  return leagueStrength(s).get(teamId)?.avg ?? 60;
}

export function strengthRanks(s: GameState): Map<string, number> {
  return new Map([...leagueStrength(s)].map(([id, v]) => [id, v.rank]));
}

type Mode = 'contender' | 'middle' | 'rebuild';
const modeOf = (rank: number): Mode => (rank <= 10 ? 'contender' : rank >= 20 ? 'rebuild' : 'middle');

// ---------- values ----------

export function playerValue(s: GameState, p: Player, mode: Mode = 'middle'): number {
  const age = ageOf(p.birthDate, new Date(s.date));
  const upside = age <= 24 ? Math.max(0, p.ratings.pot - p.ratings.ovr) * (0.5 - (age - 19) * 0.07) : 0;
  const ovrAdj = p.ratings.ovr + upside * (mode === 'contender' ? 0.5 : mode === 'rebuild' ? 1.3 : 1);
  let talent = 100 * Math.exp((ovrAdj - 75) / 5.5);
  if (mode === 'rebuild' && age >= 29) talent *= 0.7;
  if (mode === 'contender' && age <= 21) talent *= 0.85;
  const sal = salaryIn(p, s.season);
  const surplus = ((marketValue(p, s.seasonYear) - sal) / 1e6) * Math.min(3, Math.max(1, yearsLeft(p, s.season))) * 0.8;
  if (p.injury && p.injury.daysLeft > 60) talent *= 0.6;
  return talent + surplus;
}

export function pickValue(s: GameState, pick: DraftPick, mode: Mode = 'middle', ranks = strengthRanks(s)): number {
  const slot = 31 - (ranks.get(pick.original) ?? 15); // weak team → early pick
  const yearsAway = pick.year - (s.seasonYear + 1);
  const disc = 0.9 ** Math.max(0, yearsAway);
  const base = pick.round === 1 ? 260 * Math.exp(-(slot - 1) / 8) + 35 : 12;
  return base * disc * (mode === 'rebuild' ? 1.3 : mode === 'contender' ? 0.8 : 1);
}

export function sideValue(s: GameState, side: TradeSide, mode: Mode, ranks: Map<string, number>): number {
  return side.players.reduce((x, id) => x + playerValue(s, s.players[id], mode), 0)
    + side.picks.reduce((x, id) => x + pickValue(s, s.picks.find((p) => p.id === id)!, mode, ranks), 0);
}

const sideSalary = (s: GameState, side: TradeSide) => side.players.reduce((x, id) => x + (isTwoWay(s.players[id]) ? 0 : salaryIn(s.players[id], capSeason(s))), 0);

// ---------- legality + acceptance ----------

export function tradeWindowOpen(s: GameState): boolean {
  return s.phase === 'offseason' || s.phase === 'preseason' || (s.phase === 'regular' && s.date <= s.keyDates.tradeDeadline);
}

/** Legality for both sides. a gives aGives, receives bGives. */
export function tradeLegal(s: GameState, a: string, b: string, aGives: TradeSide, bGives: TradeSide): string | null {
  if (!tradeWindowOpen(s)) return 'Trade deadline has passed';
  if ((s.teams[a].league ?? 'NBA') !== (s.teams[b].league ?? 'NBA')) return 'Clubs in different leagues cannot trade — sign the player instead';
  if (!aGives.players.length && !aGives.picks.length) return 'Nothing offered';
  for (const [team, side] of [[a, aGives], [b, bGives]] as const) {
    for (const id of side.players) if (s.players[id]?.teamId !== team) return 'Player no longer on that team';
    for (const id of side.picks) if (s.picks.find((p) => p.id === id)?.owner !== team) return 'Pick not owned';
  }
  const std = (team: string) => rosterOf(s, team).filter((p) => !isTwoWay(p)).length;
  const stdSide = (side: TradeSide) => side.players.filter((id) => !isTwoWay(s.players[id])).length;
  // User must make room first; AI teams auto-waive their cheapest extras (max 2).
  const limit = (t: string) => (t === s.userTeamId ? 15 : 17);
  if (std(a) - stdSide(aGives) + stdSide(bGives) > limit(a)) return `${s.teams[a].abbr} would exceed 15 players — release someone first`;
  if (std(b) - stdSide(bGives) + stdSide(aGives) > limit(b)) return `${s.teams[b].abbr} would exceed 15 players — release someone first`;
  const ra = tradeSalaryCheck(s, a, sideSalary(s, aGives), sideSalary(s, bGives));
  if (ra) return `${s.teams[a].abbr}: ${ra}`;
  const rb = tradeSalaryCheck(s, b, sideSalary(s, bGives), sideSalary(s, aGives));
  if (rb) return `${s.teams[b].abbr}: ${rb}`;
  return null;
}

/** Would AI team `ai` accept giving `aiGives` for `aiGets`? */
export function evaluateTrade(s: GameState, ai: string, aiGives: TradeSide, aiGets: TradeSide): { accept: boolean; reason: string; margin: number } {
  const ranks = strengthRanks(s);
  const mode = modeOf(ranks.get(ai) ?? 15);
  const give = sideValue(s, aiGives, mode, ranks);
  const get = sideValue(s, aiGets, mode, ranks);
  const star = rosterOf(s, ai).reduce((b, p) => (p.ratings.ovr > b.ratings.ovr ? p : b));
  const need = aiGives.players.includes(star.id) && mode === 'contender' ? 1.5 : 1.08;
  const margin = get - give * need;
  if (margin >= 5) return { accept: true, reason: 'Deal.', margin };
  const gap = give * need - get;
  return { accept: false, margin, reason: gap > give * 0.5 ? 'Not even close.' : gap > give * 0.15 ? 'You need to add more value.' : 'Close — sweeten it a little.' };
}

export function executeTrade(s: GameState, a: string, b: string, aGives: TradeSide, bGives: TradeSide) {
  const move = (side: TradeSide, to: string) => {
    for (const id of side.players) s.players[id].teamId = to;
    for (const id of side.picks) s.picks.find((p) => p.id === id)!.owner = to;
  };
  move(aGives, b);
  move(bGives, a);
  for (const t of [a, b]) {
    const team = s.teams[t];
    if (t !== s.userTeamId) {
      const std = () => rosterOf(s, t).filter((p) => !isTwoWay(p));
      while (std().length > 15) releasePlayer(s, std().sort((x, y) => x.ratings.ovr + salaryIn(x, s.season) / 2e6 - (y.ratings.ovr + salaryIn(y, s.season) / 2e6))[0].id);
    }
    if (team.tactics.focusPlayer && s.players[team.tactics.focusPlayer]?.teamId !== t) team.tactics.focusPlayer = null;
    refreshRotation(team, s.players);
  }
  const desc = (side: TradeSide) => [
    ...side.players.map((id) => `${s.players[id].firstName} ${s.players[id].lastName}`),
    ...side.picks.map((id) => { const p = s.picks.find((x) => x.id === id)!; return `${p.year} R${p.round} (${s.teams[p.original].abbr})`; }),
  ].join(', ');
  const text = `${s.teams[a].abbr} trade ${desc(aGives)} to ${s.teams[b].abbr} for ${desc(bGives)}`;
  s.transactions.unshift({ date: s.date, kind: 'trade', text, teams: [a, b] });
  s.messages.unshift({ id: s.nextId++, date: s.date, from: 'League Office', subject: 'Trade completed', body: text, read: a !== s.userTeamId && b !== s.userTeamId, kind: 'trade' });
  s.tradeOffers = s.tradeOffers.filter((o) => ![...aGives.players, ...bGives.players].some((id) => [...o.give.players, ...o.get.players].includes(id)));
}

/** User proposes to AI. Returns result text; executes when accepted. */
export function proposeTrade(s: GameState, ai: string, userGives: TradeSide, userGets: TradeSide): { ok: boolean; text: string } {
  const legal = tradeLegal(s, s.userTeamId, ai, userGives, userGets);
  if (legal) return { ok: false, text: legal };
  const ev = evaluateTrade(s, ai, userGets, userGives);
  if (!ev.accept) return { ok: false, text: ev.reason };
  executeTrade(s, s.userTeamId, ai, userGives, userGets);
  return { ok: true, text: 'Trade accepted.' };
}

// ---------- package building ----------

/** From `team`'s assets, assemble a side worth ≥ need (to `mode` evaluator) with legal salary vs incomingSalary. */
export function buildPackage(s: GameState, team: string, need: number, incomingSalary: number, evalMode: Mode, exclude: string[], rng: Rng, ranks = strengthRanks(s)): TradeSide | null {
  const ownMode = modeOf(ranks.get(team) ?? 15);
  const core = rosterOf(s, team).sort((a, b) => b.ratings.ovr - a.ratings.ovr).slice(0, ownMode === 'contender' ? 3 : 1).map((p) => p.id);
  const players = rosterOf(s, team).filter((p) => !exclude.includes(p.id) && !core.includes(p.id) && !isTwoWay(p));
  const picks = s.picks.filter((p) => p.owner === team && p.year > s.seasonYear);
  const assets = [
    ...players.map((p) => ({ kind: 'p' as const, id: p.id, v: playerValue(s, p, evalMode), sal: salaryIn(p, s.season) })),
    ...picks.map((p) => ({ kind: 'k' as const, id: p.id, v: pickValue(s, p, evalMode, ranks), sal: 0 })),
  ].filter((x) => x.v > 0).sort((x, y) => x.v - y.v + (rng() - 0.5) * 20);
  const side: TradeSide = { players: [], picks: [] };
  let v = 0, sal = 0;
  // Salary first: match incoming (125% + 250K, or 100% for apron teams) using the cheapest-value contracts.
  // Window: enough for this team's rule (100% if apron, else 125%+250K), never more than the partner can absorb.
  const apron = payroll(s, team) + incomingSalary >= capNumbers(s.seasonYear).apron1;
  const lo = apron ? incomingSalary : (incomingSalary - 250_000) / 1.25;
  const hi = incomingSalary * 1.25 + 250_000;
  for (const x of [...assets].filter((x) => x.kind === 'p').sort((p, q) => q.sal - p.sal)) {
    if (sal >= lo) break;
    if (x.v > need * 1.2 || sal + x.sal > hi) continue;
    side.players.push(x.id); v += x.v; sal += x.sal;
    if (side.players.length >= 3) break;
  }
  if (sal < lo) return null;
  for (const x of assets) {
    if (v >= need) break;
    if ((x.kind === 'p' ? side.players : side.picks).includes(x.id)) continue;
    if (x.kind === 'p') { if (side.players.length >= 3 || sal + x.sal > hi) continue; side.players.push(x.id); sal += x.sal; } else side.picks.push(x.id);
    v += x.v;
  }
  return v >= need && side.players.length + side.picks.length > 0 ? side : null;
}

// ---------- AI activity ----------

export function aiTradeDaily(s: GameState) {
  const rng = mulberry32(hashString(`${s.seed}|trade|${s.date}`));
  s.tradeOffers = s.tradeOffers.filter((o) => o.expires >= s.date);
  const ranks = strengthRanks(s);
  const teams = Object.keys(s.teams).filter((t) => t !== s.userTeamId);

  // AI ↔ AI: a contender buys a veteran from a rebuilding team.
  if (rng() < 0.08) {
    const buyers = teams.filter((t) => modeOf(ranks.get(t)!) === 'contender');
    const sellers = teams.filter((t) => modeOf(ranks.get(t)!) === 'rebuild');
    if (buyers.length && sellers.length) {
      const buyer = buyers[Math.floor(rng() * buyers.length)];
      const seller = sellers[Math.floor(rng() * sellers.length)];
      const targets = rosterOf(s, seller).filter((p) => p.ratings.ovr >= 74 && ageOf(p.birthDate, new Date(s.date)) >= 26 && !isTwoWay(p));
      if (targets.length) {
        const t = targets[Math.floor(rng() * targets.length)];
        const want: TradeSide = { players: [t.id], picks: [] };
        const need = sideValue(s, want, 'rebuild', ranks) * 1.12;
        const pkg = buildPackage(s, buyer, need, salaryIn(t, s.season), 'rebuild', [], rng, ranks);
        if (pkg && !tradeLegal(s, buyer, seller, pkg, want) && evaluateTrade(s, seller, want, pkg).accept && evaluateTrade(s, buyer, pkg, want).margin > -need) {
          executeTrade(s, buyer, seller, pkg, want);
        }
      }
    }
  }

  // AI → user offer.
  if (rng() < 0.12 && s.tradeOffers.length < 3) {
    const from = teams[Math.floor(rng() * teams.length)];
    const mine = rosterOf(s, s.userTeamId).filter((p) => !isTwoWay(p) && p.ratings.ovr >= 68 && p.ratings.ovr <= 86);
    if (mine.length) {
      const target = mine[Math.floor(rng() * mine.length)];
      const get: TradeSide = { players: [target.id], picks: [] };
      const mode = modeOf(ranks.get(from)!);
      const need = sideValue(s, get, mode, ranks) * 0.98;
      const give = buildPackage(s, from, need, salaryIn(target, s.season), mode, [], rng, ranks);
      const why = give ? tradeLegal(s, from, s.userTeamId, give, get) : 'no-pkg';
      if (give && !why) {
        const offer: TradeOffer = { id: s.nextId++, date: s.date, from, to: s.userTeamId, give, get, expires: addDays(s.date, 5) };
        s.tradeOffers.push(offer);
        const names = give.players.map((id) => s.players[id].lastName).concat(give.picks.map((id) => id)).join(', ');
        s.messages.unshift({
          id: s.nextId++, date: s.date, from: `${s.teams[from].city} ${s.teams[from].name} GM`, kind: 'trade', read: false,
          subject: `Trade offer for ${target.firstName} ${target.lastName}`,
          body: `We'd send ${names} for ${target.firstName} ${target.lastName}. Offer expires in 5 days.`,
          action: { type: 'trade-offer', offerId: offer.id },
        });
      }
    }
  }
}

export function respondToOffer(s: GameState, offerId: number, accept: boolean): string {
  const o = s.tradeOffers.find((x) => x.id === offerId);
  if (!o) return 'Offer no longer available';
  s.tradeOffers = s.tradeOffers.filter((x) => x.id !== offerId);
  if (!accept) return 'Offer declined';
  const legal = tradeLegal(s, o.from, o.to, o.give, o.get);
  if (legal) return legal;
  executeTrade(s, o.from, o.to, o.give, o.get);
  return 'Trade completed';
}
