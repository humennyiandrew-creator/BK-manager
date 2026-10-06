// Sponsor market + theme nights (C: between-match activities).
import type { GameState, SponsorDeal } from './model';
import { hashString, mulberry32 } from './rng';
import { standings } from './season';
import { daysBetween } from './schedule';
import { clamp, marketFactor } from './mgmt/market';

declare module './model' {
  interface SponsorDeal {
    bonusPaid?: boolean;
  }
  interface Finances {
    themeNightSeason?: string;
    themeNightPending?: boolean;
  }
}

export type SponsorOffer = Omit<SponsorDeal, 'signed'>;

export const BRAND_LOCAL = ['Ridgeline Motors', 'Bluewater Bank', 'Crestview Realty', 'Harbor Grill', 'Summit Insurance', 'Northgate Automall'];
export const BRAND_NATIONAL = ['Vertex Airlines', 'Pinnacle Telecom', 'Comet Energy', 'Orbit Wireless', 'Anchor Financial', 'Solstice Apparel'];
export const BRAND_GLOBAL = ['Zenith Motors', 'Helix Technologies', 'Meridian Cola', 'Titan Athletic', 'Quantum Electronics', 'Nova Streaming'];

function msg(s: GameState, subject: string, body: string) {
  s.messages.unshift({ id: s.nextId++, date: s.date, from: 'Business Operations', subject, body, read: false, kind: 'finance' });
}

/** Deterministic per-season sponsor offers, scaled by market size, hype and results. */
export function sponsorOffers(s: GameState): SponsorOffer[] {
  const team = s.teams[s.userTeamId];
  const market = marketFactor(team.abbr);
  const hype = s.finance.hype ?? 50;
  const winPct = standings(s, team.conference).find((r) => r.teamId === team.id)?.pct ?? 0.5;
  const rng = mulberry32(hashString(`${s.seed}|sponsors|${s.season}`));
  const count = Math.round(clamp(4 + (market - 1) * 3 + (hype - 50) / 20 + winPct * 2, 4, 8));

  const offers: SponsorOffer[] = [];
  for (let i = 0; i < count; i++) {
    const roll = rng();
    const tier: SponsorDeal['tier'] = roll < 0.5 ? 'local' : roll < 0.85 ? 'national' : 'global';
    const names = tier === 'local' ? BRAND_LOCAL : tier === 'national' ? BRAND_NATIONAL : BRAND_GLOBAL;
    const name = names[Math.floor(rng() * names.length)];
    const base = tier === 'local' ? 800_000 : tier === 'national' ? 3_500_000 : 12_000_000;
    const perSeason = Math.round((base * market * (0.85 + rng() * 0.4)) / 10_000) * 10_000;
    const years = 1 + Math.floor(rng() * 4);
    const bonusKind = (['playoffs', 'title', 'wins'] as const)[Math.floor(rng() * 3)];
    const bonusTarget = bonusKind === 'wins' ? 35 + Math.floor(rng() * 20) : 1;
    const bonusAmount = Math.round((perSeason * (0.3 + rng() * 0.5)) / 10_000) * 10_000;
    const requiresHype = tier === 'local' ? 0 : tier === 'national' ? 25 + Math.floor(rng() * 20) : 55 + Math.floor(rng() * 25);
    offers.push({
      id: Math.abs(hashString(`${s.season}|sponsor${i}`)) % 1_000_000,
      name, tier, perSeason, years,
      bonus: { kind: bonusKind, target: bonusTarget, amount: bonusAmount },
      requiresHype,
    });
  }
  const signedIds = new Set((s.finance.sponsors ?? []).map((d) => d.id));
  return offers.filter((o) => !signedIds.has(o.id));
}

export function signSponsor(s: GameState, offerId: number): string | null {
  const f = s.finance;
  f.sponsors = f.sponsors ?? [];
  if (f.sponsors.length >= 3) return 'Maximum of 3 active sponsors';
  const offer = sponsorOffers(s).find((o) => o.id === offerId);
  if (!offer) return 'Offer not found';
  if (offer.requiresHype > (f.hype ?? 50)) return `Requires ${offer.requiresHype} fan hype`;
  f.sponsors.push({ ...offer, signed: s.date });
  msg(s, `${offer.name} sponsorship signed`, `Signed a ${offer.tier} sponsorship with ${offer.name}: $${(offer.perSeason / 1e6).toFixed(1)}M/season for ${offer.years} years.`);
  return null;
}

function activeSponsors(s: GameState): SponsorDeal[] {
  return (s.finance.sponsors ?? []).filter((d) => daysBetween(d.signed, s.date) < d.years * 365);
}

/** Daily sponsor income spread across the regular season, for finance.ts to add to revenue.sponsors. */
export function sponsorDailyIncome(s: GameState): number {
  const active = activeSponsors(s);
  if (!active.length) return 0;
  const days = Math.max(1, daysBetween(`${s.seasonYear}-10-01`, s.keyDates.regularEnd) + 1);
  return active.reduce((sum, d) => sum + d.perSeason / days, 0);
}

/** Weekly: check sponsor bonus conditions (win target / playoffs / title). */
export function sponsorsWeekly(s: GameState): void {
  const f = s.finance;
  const team = s.teams[s.userTeamId];
  for (const d of activeSponsors(s)) {
    if (d.bonusPaid) continue;
    let hit = false;
    if (d.bonus.kind === 'wins') {
      const w = standings(s, team.conference).find((r) => r.teamId === team.id)?.w ?? 0;
      if (w >= d.bonus.target) hit = true;
    } else if (d.bonus.kind === 'playoffs') {
      hit = s.series.some((se) => se.kind === 'playoff' && (se.high === team.id || se.low === team.id));
    } else if (d.bonus.kind === 'title') {
      hit = s.champion === team.id;
    }
    if (hit) {
      d.bonusPaid = true;
      f.cash += d.bonus.amount;
      f.revenue.sponsors += d.bonus.amount;
      msg(s, `${d.name} bonus paid`, `${d.name} paid a $${(d.bonus.amount / 1e6).toFixed(1)}M bonus for hitting the ${d.bonus.kind} target.`);
    }
  }
}

const THEME_COST_BASE = 500_000;
export const THEME_NIGHT_CAP = 6;

/** Book a themed promo night: costs cash now, raises hype, and boosts attendance at the next home game. */
export function bookThemeNight(s: GameState): string | null {
  const f = s.finance;
  if (f.themeNightSeason !== s.season) { f.themeNightSeason = s.season; f.themeNights = 0; }
  if ((f.themeNights ?? 0) >= THEME_NIGHT_CAP) return 'Already booked the maximum theme nights this season';
  const team = s.teams[s.userTeamId];
  const cost = Math.round((THEME_COST_BASE * marketFactor(team.abbr)) / 10_000) * 10_000;
  if (f.cash < cost) return 'Not enough cash';
  f.cash -= cost;
  f.themeNights = (f.themeNights ?? 0) + 1;
  f.hype = clamp((f.hype ?? 50) + 8, 0, 100);
  f.themeNightPending = true;
  msg(s, 'Theme night booked', `Booked a themed promotion night for $${(cost / 1e6).toFixed(2)}M — hype is up, and the next home game gets an attendance boost.`);
  return null;
}
