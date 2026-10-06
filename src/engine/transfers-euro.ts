// European transfer market: clubs BUY players (fee to the selling club + personal terms),
// they don't swap them. Also loans and release-clause buyouts. Football rules, basketball money.
import type { GameState, Player, TransferBid } from './model';
import { hashString, mulberry32, type Rng } from './rng';
import { addDays } from './schedule';
import { leagueOf } from './leagues';
import { buyoutCost, euroBudget, euroWage } from './euro';
import { contractRows, rosterOf, salaryIn, seasonLabel } from './cba';
import { ageOf } from './ratings';
import { refreshRotation } from './rotation';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const isEuro = (s: GameState, teamId: string) => leagueOf(s.teams[teamId]?.league).economy === 'budget';

function msg(s: GameState, from: string, subject: string, body: string) {
  s.messages.unshift({ id: s.nextId++, date: s.date, from, subject, body, read: false, kind: 'trade' });
}

/** Windows: summer (June 1 – Sept 30) and a short winter window (Jan 1 – Feb 15). */
export function transferWindowOpen(s: GameState): boolean {
  const md = s.date.slice(5);
  return (md >= '06-01' && md <= '09-30') || (md >= '01-01' && md <= '02-15') || s.phase === 'offseason' || s.phase === 'preseason';
}

/** What a club would pay to sign this player outright: ability, age, contract length left. */
export function transferValue(s: GameState, p: Player): number {
  const age = ageOf(p.birthDate, new Date(s.date));
  const wage = euroWage(p.ratings.ovr, age);
  const yearsLeft = p.contract?.salaries.filter((x) => x.season >= s.season).length ?? 0;
  const youth = age <= 24 ? 1.25 + Math.max(0, p.ratings.pot - p.ratings.ovr) * 0.02 : age >= 32 ? 0.55 : 1;
  const form = 1 + clamp(p.form ?? 0, -1.5, 1.5) * 0.08;
  const lock = yearsLeft >= 3 ? 1.5 : yearsLeft === 2 ? 1.25 : yearsLeft === 1 ? 0.9 : 0.35;
  return Math.round((wage * 2.4 * youth * form * lock) / 50_000) * 50_000;
}

export const askingPriceFor = (s: GameState, p: Player) => Math.round(transferValue(s, p) * 1.15);

/** Room left under a European club's wage budget. */
export function wageRoom(s: GameState, teamId: string): number {
  const wages = rosterOf(s, teamId).reduce((x, q) => x + salaryIn(q, s.season), 0);
  return euroBudget(s, teamId) - wages;
}

export interface BidResult { ok: boolean; text: string }

/** User's club bids for a player at another club. */
export function makeBid(s: GameState, playerId: string, fee: number, wage: number, years: number): BidResult {
  const p = s.players[playerId];
  if (!p?.teamId) return { ok: false, text: 'Player is a free agent — sign him instead' };
  if (!transferWindowOpen(s)) return { ok: false, text: 'The transfer window is shut' };
  const buyer = s.userTeamId;
  if (p.teamId === buyer) return { ok: false, text: 'He already plays for you' };
  const league = leagueOf(s.teams[buyer].league);
  if (rosterOf(s, buyer).length >= league.maxRoster) return { ok: false, text: `Roster full (${league.maxRoster})` };
  if (isEuro(s, buyer)) {
    if (fee > (s.finance?.cash ?? 0)) return { ok: false, text: 'Not enough cash for that fee' };
    if (wage > wageRoom(s, buyer)) return { ok: false, text: `Wage budget exceeded ($${(wageRoom(s, buyer) / 1e6).toFixed(2)}M left)` };
  }
  const bid: TransferBid = {
    id: s.nextId++, date: s.date, playerId, fromTeam: p.teamId, toTeam: buyer,
    fee, wage, years, status: 'pending', fromUser: true, expires: addDays(s.date, 3),
  };
  s.bids.push(bid);
  return resolveBid(s, bid);
}

/** Selling club decides, then the player decides. */
export function resolveBid(s: GameState, bid: TransferBid): BidResult {
  const p = s.players[bid.playerId];
  const seller = s.teams[bid.fromTeam];
  const rng = mulberry32(hashString(`${s.seed}|bid|${bid.id}`));
  const ask = askingPriceFor(s, p);
  const squad = rosterOf(s, bid.fromTeam);
  const keyMan = squad.sort((a, b) => b.ratings.ovr - a.ratings.ovr).slice(0, 3).includes(p);
  const need = ask * (keyMan ? 1.45 : 1) * (squad.length <= 11 ? 1.2 : 1);

  // A club with no room is far more willing to cash in on a fringe player.
  const surplus = squad.length >= leagueOf(seller.league).maxRoster && !keyMan;
  if (bid.fee < need * (surplus ? 0.75 : 0.95)) {
    bid.status = 'rejected';
    bid.note = bid.fee < need * 0.6 ? `${seller.name} dismiss the bid out of hand.` : `${seller.name} want around $${(need / 1e6).toFixed(2)}M.`;
    return { ok: false, text: bid.note };
  }
  // Player: wage vs his market rate, plus ambition (bigger club = more tempting).
  const rate = euroWage(p.ratings.ovr, ageOf(p.birthDate, new Date(s.date)));
  const loyalty = p.ratings.personality.loyalty / 20;
  const wanted = rate * (1.05 + loyalty * 0.12 - (p.morale - 60) / 500);
  if (bid.wage < wanted * 0.95 || bid.years < 1) {
    bid.status = 'rejected';
    bid.note = `${p.lastName} wants about $${(wanted / 1e6).toFixed(2)}M per season.`;
    return { ok: false, text: bid.note };
  }
  if (rng() < 0.08) {
    bid.status = 'rejected';
    bid.note = `${p.lastName} has decided to stay at ${seller.name} for now.`;
    return { ok: false, text: bid.note };
  }
  completeTransfer(s, bid);
  return { ok: true, text: `${p.firstName} ${p.lastName} joins ${s.teams[bid.toTeam].name} for $${(bid.fee / 1e6).toFixed(2)}M.` };
}

export function completeTransfer(s: GameState, bid: TransferBid) {
  const p = s.players[bid.playerId];
  const from = bid.fromTeam, to = bid.toTeam;
  p.teamId = to;
  p.assigned = false;
  p.affiliate = undefined;
  p.contract = { salaries: contractRows(s.seasonYear + (s.phase === 'offseason' ? 1 : 0), bid.wage, bid.years), type: 'standard' };
  bid.status = 'completed';
  if (to === s.userTeamId && s.finance) { s.finance.cash -= bid.fee; s.finance.expense.operations += bid.fee; }
  if (from === s.userTeamId && s.finance) { s.finance.cash += bid.fee; s.finance.revenue.sponsors += bid.fee; }
  refreshRotation(s.teams[from], s.players);
  refreshRotation(s.teams[to], s.players);
  const text = `${s.teams[to].name} sign ${p.firstName} ${p.lastName} from ${s.teams[from].name} for $${(bid.fee / 1e6).toFixed(2)}M`;
  s.transactions.unshift({ date: s.date, kind: 'sign', text, teams: [from, to] });
  if (from === s.userTeamId || to === s.userTeamId) msg(s, 'Sporting Director', 'Transfer completed', text);
}

/** Pay a release clause / buyout to free a player, then negotiate personal terms. */
export function payBuyout(s: GameState, playerId: string): BidResult {
  const p = s.players[playerId];
  if (!p?.teamId) return { ok: false, text: 'Player is already free' };
  const cost = buyoutCost(s, p);
  if ((s.finance?.cash ?? 0) < cost) return { ok: false, text: `Buyout costs $${(cost / 1e6).toFixed(2)}M — not enough cash` };
  if (s.finance) { s.finance.cash -= cost; s.finance.expense.operations += cost; }
  const from = p.teamId;
  p.teamId = null;
  p.contract = null;
  refreshRotation(s.teams[from], s.players);
  s.transactions.unshift({ date: s.date, kind: 'release', text: `${s.teams[from].name} release ${p.firstName} ${p.lastName} after a buyout`, teams: [from] });
  return { ok: true, text: `${p.lastName} is a free agent — agree personal terms to sign him.` };
}

// ---------- AI market ----------

function aiSquadNeed(s: GameState, teamId: string): number {
  const squad = rosterOf(s, teamId);
  const league = leagueOf(s.teams[teamId].league);
  return league.maxRoster - squad.length;
}

/** Bids the user receives for his players, plus club-to-club business among AI clubs. */
export function euroTransferDaily(s: GameState) {
  if (!transferWindowOpen(s)) return;
  const rng: Rng = mulberry32(hashString(`${s.seed}|xfer|${s.date}`));
  s.bids = s.bids.filter((b) => b.status === 'pending' ? b.expires >= s.date : b.date >= addDays(s.date, -30));

  const euroTeams = Object.values(s.teams).filter((t) => isEuro(s, t.id));
  if (euroTeams.length < 2) return;

  // AI ↔ AI: a club with room and money buys an upgrade.
  if (rng() < 0.25) {
    const buyer = euroTeams[Math.floor(rng() * euroTeams.length)];
    if (buyer.id !== s.userTeamId && aiSquadNeed(s, buyer.id) > 0 && wageRoom(s, buyer.id) > 250_000) {
      const targets = Object.values(s.players).filter((p) => p.teamId && p.teamId !== buyer.id && isEuro(s, p.teamId) && p.ratings.ovr >= 65);
      const target = targets[Math.floor(rng() * targets.length)];
      if (target) {
        const wage = Math.min(wageRoom(s, buyer.id), euroWage(target.ratings.ovr, ageOf(target.birthDate, new Date(s.date))) * 1.1);
        const bid: TransferBid = {
          id: s.nextId++, date: s.date, playerId: target.id, fromTeam: target.teamId!, toTeam: buyer.id,
          fee: Math.round(askingPriceFor(s, target) * (0.95 + rng() * 0.2)), wage, years: 2, status: 'pending', fromUser: false,
          expires: addDays(s.date, 2),
        };
        if (target.teamId !== s.userTeamId) { s.bids.push(bid); resolveBid(s, bid); }
      }
    }
  }

  // AI → user: a rival bids for one of your players.
  if (rng() < 0.12 && isEuro(s, s.userTeamId)) {
    const mine = rosterOf(s, s.userTeamId).filter((p) => p.ratings.ovr >= 66);
    const target = mine[Math.floor(rng() * mine.length)];
    const buyers = euroTeams.filter((t) => t.id !== s.userTeamId && wageRoom(s, t.id) > 300_000);
    const buyer = buyers[Math.floor(rng() * buyers.length)];
    if (target && buyer && !s.bids.some((b) => b.playerId === target.id && b.status === 'pending')) {
      const fee = Math.round(askingPriceFor(s, target) * (0.8 + rng() * 0.5));
      const bid: TransferBid = {
        id: s.nextId++, date: s.date, playerId: target.id, fromTeam: s.userTeamId, toTeam: buyer.id,
        fee, wage: euroWage(target.ratings.ovr, ageOf(target.birthDate, new Date(s.date))) * 1.1, years: 3,
        status: 'pending', fromUser: false, expires: addDays(s.date, 3),
      };
      s.bids.push(bid);
      msg(s, `${buyer.name}`, `Bid received for ${target.lastName}`,
        `${buyer.name} offer $${(fee / 1e6).toFixed(2)}M for ${target.firstName} ${target.lastName}. Your valuation: $${(askingPriceFor(s, target) / 1e6).toFixed(2)}M.`);
    }
  }
}

/** User answers a bid for one of his players. */
export function respondToBid(s: GameState, bidId: number, accept: boolean): BidResult {
  const bid = s.bids.find((b) => b.id === bidId);
  if (!bid || bid.status !== 'pending') return { ok: false, text: 'That bid has expired' };
  if (!accept) { bid.status = 'rejected'; return { ok: true, text: 'Bid rejected' }; }
  completeTransfer(s, bid);
  return { ok: true, text: `Sold for $${(bid.fee / 1e6).toFixed(2)}M` };
}

/** Send a young player on loan for a season: he keeps playing, the other club pays his wages. */
export function loanOut(s: GameState, playerId: string, toTeam: string): BidResult {
  const p = s.players[playerId];
  if (!p || p.teamId !== s.userTeamId) return { ok: false, text: 'Not your player' };
  if (ageOf(p.birthDate, new Date(s.date)) > 24) return { ok: false, text: 'Only players 24 and under can be loaned' };
  if (rosterOf(s, toTeam).length >= leagueOf(s.teams[toTeam].league).maxRoster) return { ok: false, text: 'That club has no space' };
  p.teamId = toTeam;
  p.assigned = false;
  p.loan = { parent: s.userTeamId, until: `${s.seasonYear + 1}-06-30` };
  refreshRotation(s.teams[s.userTeamId], s.players);
  refreshRotation(s.teams[toTeam], s.players);
  s.transactions.unshift({ date: s.date, kind: 'sign', text: `${p.firstName} ${p.lastName} joins ${s.teams[toTeam].name} on loan`, teams: [s.userTeamId, toTeam] });
  return { ok: true, text: `${p.lastName} loaned to ${s.teams[toTeam].name}` };
}

/** Loans expire at the end of the season. */
export function returnLoans(s: GameState) {
  for (const p of Object.values(s.players)) {
    if (!p.loan || p.loan.until > s.date) continue;
    const parent = p.loan.parent;
    const from = p.teamId;
    p.teamId = parent;
    p.loan = undefined;
    if (from) refreshRotation(s.teams[from], s.players);
    refreshRotation(s.teams[parent], s.players);
  }
}

export const seasonOf = seasonLabel;
