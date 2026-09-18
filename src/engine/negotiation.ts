// A4: agent contract negotiations — free agency, re-signing, mid-season extensions.
import type { ContractOffer, GameState, Negotiation, Player } from './model';
import { askingPrice, sign } from './freeagency';
import { commitResign, expiring, resignAsk } from './offseason';
import { capYear, contractRows, desiredYears, marketValue, signingCheck } from './cba';
import { ageOf } from './ratings';
import { hashString, mulberry32, type Rng } from './rng';

export type NegKind = Negotiation['kind'];
export interface OfferResult { type: 'accept' | 'counter' | 'reject' | 'walk'; message: string; counter?: ContractOffer }

const fmtM = (amount: number) => `$${(amount / 1e6).toFixed(2)}M`;
const pick = <T,>(arr: T[], rng: Rng): T => arr[Math.floor(rng() * arr.length) % arr.length];

// ---------- flavour ----------

function openingLine(rng: Rng, ask: ContractOffer, rivals: number): string {
  const riv = rivals > 0 ? `${rivals} other team${rivals > 1 ? 's' : ''} ${rivals > 1 ? 'are' : 'is'} already calling. ` : '';
  return riv + pick([
    `My client is looking for ${fmtM(ask.amount)} a year over ${ask.years} years.`,
    `We're asking ${fmtM(ask.amount)}/yr, ${ask.years}y — that's where we start.`,
    `Let's be straight: ${fmtM(ask.amount)} a year for ${ask.years} years gets a deal done.`,
  ], rng);
}
const acceptLine = (rng: Rng) => pick(['We have a deal — my client is ready to sign.', "That works. Let's get this done.", 'He\'s satisfied. Send the paperwork over.'], rng);
const counterLine = (rng: Rng, ask: ContractOffer) => pick([
  `Getting closer. My client can meet you at ${fmtM(ask.amount)}/yr.`,
  `Not quite there — come up to ${fmtM(ask.amount)}/yr and we're talking.`,
  `We'll move to ${fmtM(ask.amount)}/yr. That's a fair middle ground.`,
], rng);
const rejectLine = (rng: Rng) => pick([
  'That\'s short of what we need. My client has other teams calling — try again.',
  'Not enough. We\'ll keep exploring the market.',
  'That number doesn\'t reflect his value. Come back with more.',
], rng);
const insultLine = (rng: Rng) => pick([
  'Is this a joke? That\'s insulting for a player of his caliber.',
  'My client won\'t even consider that number. Don\'t waste our time.',
  'That offer tells us you\'re not serious about this negotiation.',
], rng);
const walkLine = (rng: Rng) => pick([
  'We\'re done here. My client is moving on.',
  'That\'s it — we\'re walking away from the table.',
  'No deal. He\'ll test the rest of the market.',
], rng);

// ---------- model ----------

/** Annual value of an offer once player preferences are applied (years/options/incentives). */
function offerValue(offer: ContractOffer, p: Player, seasonYr: number): number {
  let v = offer.amount + Math.round((offer.incentives ?? 0) * 0.5); // incentives count half for value (and for cap)
  if (offer.playerOption) v *= 1.04;
  if (offer.teamOption) v *= 0.94;
  const age = ageOf(p.birthDate, new Date(`${seasonYr}-10-01`));
  if (age <= 25) v *= 1 + Math.min(0.06, Math.max(0, offer.years - 1) * 0.015); // young players value years
  else if (age >= 30) v *= offer.years <= 2 ? 1.03 : Math.max(0.9, 1 - (offer.years - 2) * 0.025); // vets want guaranteed money over long deals
  return v;
}

/** Hidden floor as a fraction of the (rival-inflated) ask: lower for high ego/prickly temperament, higher for loyal/happy players. */
function floorMult(p: Player): number {
  const { ego, temperament, loyalty } = p.ratings.personality;
  const moraleAdj = (p.morale - 60) / 800;
  const m = 0.955 - ((ego - 10) / 10) * 0.02 - (temperament <= 8 ? 0.02 : 0) + ((loyalty - 10) / 10) * 0.015 + moraleAdj;
  return Math.max(0.88, Math.min(0.95, m));
}

/** How many other teams could plausibly afford him right now (cap room or an unused MLE). */
function countRivals(s: GameState, p: Player, amount: number): number {
  const cap = s.phase === 'offseason' ? 5 : 1;
  let n = 0;
  for (const t of Object.keys(s.teams)) {
    if (n >= cap) break;
    if (t === s.userTeamId || t === p.teamId) continue;
    if (!signingCheck(s, t, p, amount, false).reason) n++;
  }
  return n;
}

function roundTo10k(v: number) { return Math.round(v / 10_000) * 10_000; }

// ---------- negotiations ----------

/** Starts (or reuses an already-open) negotiation for a player. */
export function startNegotiation(s: GameState, pid: string, kind: NegKind): Negotiation {
  const existing = s.negotiations.find((n) => n.playerId === pid && n.kind === kind && n.status === 'open');
  if (existing) return existing;
  if (kind === 'fa') {
    const walked = s.negotiations.find((n) => n.playerId === pid && n.kind === 'fa' && n.status === 'walked');
    if (walked) return walked; // won't negotiate again this window
  }
  const p = s.players[pid];
  const rng = mulberry32(hashString(`${s.seed}|neg|${pid}|${s.date}|${kind}`));

  let base: { amount: number; years: number };
  if (kind === 'fa') base = askingPrice(s, p);
  else if (kind === 'resign') base = resignAsk(s, p);
  else base = { amount: marketValue(p, s.seasonYear + 1), years: desiredYears(p, s.seasonYear + 1) };

  const rivals = countRivals(s, p, base.amount);
  const ask: ContractOffer = { amount: roundTo10k(base.amount * (1 + rivals * 0.04)), years: base.years };
  const floor = roundTo10k(ask.amount * floorMult(p));

  const neg: Negotiation = {
    id: s.nextId++, playerId: pid, teamId: s.userTeamId, kind,
    round: 0, patience: Math.max(0, Math.min(100, 100 - p.ratings.personality.ego * 2)),
    ask, floor, rivals, status: 'open',
    log: [{ by: 'agent', text: openingLine(rng, ask, rivals), offer: ask }],
    date: s.date,
  };
  s.negotiations.unshift(neg);
  if (s.negotiations.length > 60) s.negotiations.length = 60;
  return neg;
}

function finalizeAccept(s: GameState, neg: Negotiation, offer: ContractOffer): string | null {
  const p = s.players[neg.playerId];
  const amount = offer.amount + Math.round((offer.incentives ?? 0) * 0.5); // incentives count half for cap purposes
  if (neg.kind === 'fa') {
    const check = signingCheck(s, s.userTeamId, p, amount, false);
    if (check.reason) return check.reason;
    if (check.usesMle) s.teams[s.userTeamId].mleUsed = true;
    sign(s, s.userTeamId, p, amount, offer.years, false);
  } else if (neg.kind === 'resign') {
    if (s.offseason?.stage !== 'resign') return 'Re-sign window is closed';
    if (p.teamId !== s.userTeamId || !expiring(s, s.userTeamId).includes(p)) return 'Not an expiring contract on your team';
    commitResign(s, p, amount, offer.years);
  } else {
    const err = extendPlayer(s, p.id, offer);
    if (err) return err;
    return null;
  }
  if (offer.playerOption || offer.teamOption) {
    const rows = p.contract!.salaries;
    p.contract!.option = { season: rows[rows.length - 1].season, kind: offer.playerOption ? 'player' : 'team' };
  }
  return null;
}

/** Team submits an offer; the agent accepts, counters, rejects (patience drops), or walks. */
export function makeOffer(s: GameState, negId: number, offer: ContractOffer): OfferResult {
  const neg = s.negotiations.find((n) => n.id === negId);
  if (!neg || neg.status !== 'open') return { type: 'reject', message: 'This negotiation is no longer open.' };
  const p = s.players[neg.playerId];
  const rng = mulberry32(hashString(`${s.seed}|neg|${neg.id}|${neg.round}`));

  neg.log.push({ by: 'team', text: `Offer: ${fmtM(offer.amount)}/yr, ${offer.years}y${offer.playerOption ? ', player option' : ''}${offer.teamOption ? ', team option' : ''}${offer.incentives ? `, +${fmtM(offer.incentives)} incentives` : ''}`, offer });
  neg.round++;

  const seasonYr = neg.kind === 'extension' ? s.seasonYear + 1 : capYear(s);
  const value = offerValue(offer, p, seasonYr);

  let result: OfferResult;
  if (value >= neg.ask.amount * 0.99) {
    result = { type: 'accept', message: acceptLine(rng) };
  } else if (value >= neg.floor) {
    const mid = roundTo10k((neg.ask.amount + Math.max(offer.amount, neg.floor)) / 2);
    neg.ask = { ...neg.ask, amount: Math.max(neg.floor, Math.min(neg.ask.amount, mid)) };
    result = { type: 'counter', message: counterLine(rng, neg.ask), counter: neg.ask };
  } else {
    const gap = Math.min(1, (neg.floor - value) / neg.floor);
    const insulting = value < neg.floor * 0.8;
    neg.patience -= insulting ? 50 : Math.round(20 + gap * 20);
    result = { type: 'reject', message: insulting ? insultLine(rng) : rejectLine(rng) };
  }

  if (neg.round >= 6 && result.type !== 'accept') neg.patience = Math.min(neg.patience, 0);
  if (result.type !== 'accept' && neg.patience <= 0) {
    neg.status = 'walked';
    result = { type: 'walk', message: walkLine(rng) };
    if (neg.kind === 'extension') p.morale = Math.max(0, p.morale - 10);
  }

  if (result.type === 'accept') {
    const err = finalizeAccept(s, neg, offer);
    if (err) { result = { type: 'reject', message: err }; neg.status = 'open'; }
    else neg.status = 'signed';
  }

  neg.log.push({ by: 'agent', text: result.message, offer: result.counter });
  return result;
}

/** Mid-season/preseason extension: player must have exactly one season left on his current deal (rookies picking up a year-3 team option are eligible one year earlier). Appends new rows starting next season. */
export function extendPlayer(s: GameState, pid: string, offer: ContractOffer): string | null {
  const p = s.players[pid];
  if (!p || p.teamId !== s.userTeamId) return 'Not on your roster';
  if (s.phase === 'offseason' || s.phase === 'playoffs') return 'Extensions are only available in the preseason or regular season';
  if (s.phase === 'regular' && s.date > s.keyDates.tradeDeadline) return 'Extensions close at the trade deadline';
  if (!p.contract) return 'No contract to extend';
  const remaining = p.contract.salaries.filter((x) => x.season >= s.season);
  const rookieEarly = p.contract.type === 'rookie' && p.yearsPro >= 2 && remaining.length <= 2;
  if (remaining.length !== 1 && !rookieEarly) return 'Not extension-eligible (needs exactly one season left on his deal)';
  if (offer.years < 1 || offer.years > 5) return 'Contract length must be 1–5 years';
  const startYear = s.seasonYear + 1;
  const rows = contractRows(startYear, offer.amount, offer.years);
  p.contract.salaries = [...p.contract.salaries, ...rows];
  p.contract.type = 'standard';
  p.contract.option = (offer.playerOption || offer.teamOption) ? { season: rows[rows.length - 1].season, kind: offer.playerOption ? 'player' : 'team' } : undefined;
  s.transactions.unshift({ date: s.date, kind: 'extend', text: `${s.teams[s.userTeamId].abbr} extend ${p.firstName} ${p.lastName} (${offer.years}y, $${(offer.amount / 1e6).toFixed(1)}M)`, teams: [s.userTeamId] });
  return null;
}

/** Players eligible for an extension right now (Squad Hub "Extensions" tab). */
export function extensionEligible(s: GameState): Player[] {
  if (s.phase === 'offseason' || s.phase === 'playoffs') return [];
  if (s.phase === 'regular' && s.date > s.keyDates.tradeDeadline) return [];
  return Object.values(s.players).filter((p) => {
    if (p.teamId !== s.userTeamId || !p.contract) return false;
    const remaining = p.contract.salaries.filter((x) => x.season >= s.season);
    return remaining.length === 1 || (p.contract.type === 'rookie' && p.yearsPro >= 2 && remaining.length <= 2);
  });
}
