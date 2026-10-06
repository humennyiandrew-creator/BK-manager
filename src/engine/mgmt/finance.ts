// Club finances: cash, revenue, expenses, ticket pricing.
import type { Finances, Game, GameState } from '../model';
import { luxuryTax, payroll } from '../cba';
import { standings } from '../season';
import { daysBetween } from '../schedule';
import { FACILITY_IDS, facilityLevel } from './facilities';
import { clamp, marketFactor, top3Ovr } from './market';
import { sponsorDailyIncome } from '../sponsors';

export function initFinances(s: GameState): void {
  const team = s.teams[s.userTeamId];
  const market = marketFactor(team.abbr);
  const finance: Finances = {
    cash: Math.round(30_000_000 * market),
    ticketPrice: Math.round((110 * market) / 5) * 5,
    revenue: { tickets: 0, tv: 0, merch: 0, sponsors: 0, playoffs: 0 },
    expense: { salaries: 0, staff: 0, facilities: 0, tax: 0, operations: 0 },
    monthly: [],
    attendance: [],
    hype: 50,
    themeNights: 0,
    sponsors: [],
  };
  s.finance = finance;
}

/** ±15% attendance/merch swing between hype 0 and 100, neutral at 50. */
function hypeMul(f: Finances): number {
  return 1 + (((f.hype ?? 50) - 50) / 50) * 0.15;
}

function msg(s: GameState, subject: string, body: string) {
  s.messages.unshift({ id: s.nextId++, date: s.date, from: 'Finance Department', subject, body, read: false, kind: 'finance' });
}

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

/** Called once per sim day after games. playedToday = games completed today. */
export function financeDaily(s: GameState, playedToday: Game[]): void {
  const f = s.finance;
  const team = s.teams[s.userTeamId];
  const revBefore = sum(f.revenue);
  const expBefore = sum(f.expense);

  // (a) user home games played today
  for (const g of playedToday) {
    if (g.home !== s.userTeamId || !g.result) continue;
    const winPct = standings(s, team.conference).find((r) => r.teamId === team.id)?.pct ?? 0.5;
    const star = clamp((top3Ovr(s, team.id) - 220) / 50, 0, 1);
    const priceRatio = f.ticketPrice / 110;
    const elasticity = clamp(1 - (priceRatio - 1) * 0.45, 0.55, 1.15);
    const arenaBoost = 0.86 + facilityLevel(s, team.id, 'arena') * 0.028;
    const themeBoost = f.themeNightPending ? 1.12 : 1;
    const frac = clamp((0.55 + winPct * 0.3 + star * 0.15) * elasticity * arenaBoost * hypeMul(f) * themeBoost, 0.3, 1);
    f.themeNightPending = false;
    const attendees = team.arenaCapacity * frac;
    let rev = attendees * f.ticketPrice;
    if (g.type !== 'regular') {
      rev *= 1.6;
      f.revenue.playoffs += rev;
    } else {
      f.revenue.tickets += rev;
    }
    f.cash += rev;
    f.attendance.push(frac);
    if (f.attendance.length > 40) f.attendance.shift();
  }

  // (a2) facility maintenance: sum(levels)×$0.25M + nodes×$0.1M per month, spread daily, year-round
  {
    const levels = FACILITY_IDS.reduce((sum, id) => sum + facilityLevel(s, team.id, id), 0);
    const nodeCount = FACILITY_IDS.reduce((sum, id) => sum + (s.facilities[team.id][id].nodes?.length ?? 0), 0);
    const maintDaily = (levels * 250_000 + nodeCount * 100_000) / 30;
    f.expense.facilities += maintDaily;
    f.cash -= maintDaily;
  }

  // (b) daily spread of salaries/staff/operations/tv/merch while the season is live
  if (s.phase === 'regular' || s.phase === 'playin' || s.phase === 'playoffs') {
    const seasonStart = `${s.seasonYear}-10-20`;
    const regEnd = s.keyDates.regularEnd;
    if (s.date >= seasonStart && s.date <= regEnd) {
      const regDays = Math.max(1, daysBetween(seasonStart, regEnd) + 1);
      const daily = payroll(s, s.userTeamId) / regDays;
      f.expense.salaries += daily;
      f.cash -= daily;
    }

    const staffPay = s.staff.filter((x) => x.teamId === s.userTeamId).reduce((a, x) => a + x.salary, 0);
    const staffDaily = staffPay / 365;
    f.expense.staff += staffDaily;
    f.cash -= staffDaily;

    const opsDaily = 55_000_000 / 365;
    f.expense.operations += opsDaily;
    f.cash -= opsDaily;

    const tvDaily = 210_000_000 / 365;
    f.revenue.tv += tvDaily;
    f.cash += tvDaily;

    const winPct = standings(s, team.conference).find((r) => r.teamId === team.id)?.pct ?? 0.5;
    const star = clamp((top3Ovr(s, team.id) - 220) / 50, 0, 1);
    const popularity = clamp(0.5 + winPct * 0.35 + star * 0.15, 0.3, 1);
    const marketNorm = clamp((marketFactor(team.abbr) - 0.8) / 0.7, 0, 1);
    const annualMS = clamp(60_000_000 + (60_000_000 + marketNorm * 30_000_000) * popularity, 60_000_000, 150_000_000);
    const msDaily = annualMS / 365;
    f.revenue.merch += msDaily * 0.45 * hypeMul(f);
    f.revenue.sponsors += msDaily * 0.55;
    f.cash += msDaily;

    if (f.sponsorBonus) {
      const bonusDaily = f.sponsorBonus / 30;
      f.revenue.sponsors += bonusDaily;
      f.cash += bonusDaily;
    }

    const sponsorDaily = sponsorDailyIncome(s);
    if (sponsorDaily) {
      f.revenue.sponsors += sponsorDaily;
      f.cash += sponsorDaily;
    }
  }

  // (c) luxury tax, once, at regular season end
  if (s.date === s.keyDates.regularEnd) {
    const tax = luxuryTax(payroll(s, s.userTeamId), s.seasonYear);
    if (tax > 0) {
      f.expense.tax += tax;
      f.cash -= tax;
      msg(s, 'Luxury tax bill', `The league has assessed a luxury tax bill of $${(tax / 1e6).toFixed(1)}M.`);
    }
  }

  // (d) monthly snapshot
  const month = s.date.slice(0, 7);
  let entry = f.monthly.find((m) => m.month === month);
  if (!entry) {
    const prev = f.monthly[f.monthly.length - 1];
    if (prev) {
      msg(s, 'Monthly financial summary', `${prev.month}: revenue $${(prev.revenue / 1e6).toFixed(1)}M, expense $${(prev.expense / 1e6).toFixed(1)}M, cash $${(prev.cash / 1e6).toFixed(1)}M.`);
      f.hype = Math.round(clamp((f.hype ?? 50) + ((50 - (f.hype ?? 50)) * 0.3), 0, 100));
    }
    entry = { month, revenue: 0, expense: 0, cash: f.cash };
    f.monthly.push(entry);
  }
  entry.revenue += sum(f.revenue) - revBefore;
  entry.expense += sum(f.expense) - expBefore;
  entry.cash = f.cash;
}
