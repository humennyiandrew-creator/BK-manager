import { useState } from 'react';
import HeroHeader from '../components/HeroHeader';
import Panel from '../components/Panel';
import SectionCard from '../components/SectionCard';
import StatTile from '../components/StatTile';
import ProgressBar from '../components/ProgressBar';
import { useGameState, useGame } from '../store/useGame';
import { capNumbers, luxuryTax, payroll } from '../../engine/cba';
import { standings } from '../../engine/season';
import { facilityLevel } from '../../engine/mgmt/facilities';
import { clamp, top3Ovr } from '../../engine/mgmt/market';
import type { ExpenseCat, GameState, RevenueCat } from '../../engine/model';
import { bookThemeNight, signSponsor, sponsorOffers, THEME_NIGHT_CAP } from '../../engine/sponsors';
import { formatMoney, formatMoneyShort } from '../format';
import styles from './FinancesScreen.module.css';

const REVENUE_LABEL: Record<RevenueCat, string> = { tickets: 'Tickets', tv: 'TV / Media', merch: 'Merchandise', sponsors: 'Sponsors', playoffs: 'Playoff Gate' };
const EXPENSE_LABEL: Record<ExpenseCat, string> = { salaries: 'Player Salaries', staff: 'Staff Salaries', facilities: 'Facilities', tax: 'Luxury Tax', operations: 'Operations' };

function projectedAttendance(s: GameState, ticketPrice: number): number {
  const team = s.teams[s.userTeamId];
  const winPct = standings(s, team.conference).find((r) => r.teamId === team.id)?.pct ?? 0.5;
  const star = clamp((top3Ovr(s, team.id) - 220) / 50, 0, 1);
  const priceRatio = ticketPrice / 110;
  const elasticity = clamp(1 - (priceRatio - 1) * 0.45, 0.55, 1.15);
  const arenaBoost = 0.86 + facilityLevel(s, team.id, 'arena') * 0.028;
  return clamp((0.55 + winPct * 0.3 + star * 0.15) * elasticity * arenaBoost, 0.3, 1);
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className={styles.barRow}>
      <span className={styles.barLabel}>{label}</span>
      <div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, background: color }} /></div>
      <span className={styles.barValue}>{formatMoneyShort(value)}</span>
    </div>
  );
}

function MonthlyChart({ monthly }: { monthly: GameState['finance']['monthly'] }) {
  if (monthly.length < 2) return <div className={styles.chartEmpty}>Not enough history yet.</div>;
  const values = monthly.map((m) => m.cash);
  const lo = Math.min(...values), hi = Math.max(...values);
  const range = hi - lo || 1;
  const w = 300, h = 90;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - lo) / range) * h}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={styles.chart} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="var(--cyan)" strokeWidth={2} />
      {values.map((v, i) => (
        <circle key={i} cx={(i / (values.length - 1)) * w} cy={h - ((v - lo) / range) * h} r={2} fill="var(--cyan)" />
      ))}
    </svg>
  );
}

function bonusProgress(s: GameState, bonus: { kind: 'playoffs' | 'title' | 'wins'; target: number; amount: number }): string {
  if (bonus.kind === 'wins') {
    const team = s.teams[s.userTeamId];
    const w = standings(s, team.conference).find((r) => r.teamId === team.id)?.w ?? 0;
    return `${w}/${bonus.target} wins → $${(bonus.amount / 1e6).toFixed(1)}M`;
  }
  if (bonus.kind === 'playoffs') return `Reach the playoffs → $${(bonus.amount / 1e6).toFixed(1)}M`;
  return `Win the title → $${(bonus.amount / 1e6).toFixed(1)}M`;
}

export default function FinancesScreen() {
  const s = useGameState();
  const mutate = useGame((g) => g.mutate);
  const [price, setPrice] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  if (!s) return null;

  const f = s.finance;
  const cap = capNumbers(s.seasonYear);
  const pay = payroll(s, s.userTeamId);
  const projTax = luxuryTax(pay, s.seasonYear);
  const barMax = cap.apron2 * 1.15;
  const ticketPrice = price ?? f.ticketPrice;
  const attendPct = Math.round(projectedAttendance(s, ticketPrice) * 100);

  const revTotal = Object.values(f.revenue).reduce((a, b) => a + b, 0);
  const expTotal = Object.values(f.expense).reduce((a, b) => a + b, 0);
  const revMax = Math.max(...Object.values(f.revenue), 1);
  const expMax = Math.max(...Object.values(f.expense), 1);

  const commit = (v: number) => {
    setPrice(v);
    mutate((st) => { st.finance.ticketPrice = v; });
  };

  const recent = f.attendance.slice(-16);
  const hype = f.hype ?? 50;
  const offers = sponsorOffers(s);
  const themeNights = f.themeNightSeason === s.season ? (f.themeNights ?? 0) : 0;

  const doSign = (offerId: number) => mutate((st) => { setNote(signSponsor(st, offerId)); });
  const doTheme = () => mutate((st) => { setNote(bookThemeNight(st)); });

  const cashDelta = f.monthly.length >= 2 ? f.monthly[f.monthly.length - 1].cash - f.monthly[f.monthly.length - 2].cash : undefined;

  return (
    <div className={styles.screen}>
      <HeroHeader title="Finances" subtitle="Budget and payroll" />
      <div className={styles.wrap}>
      <div className={styles.col}>
        <SectionCard title="Overview" accent className={styles.panel}>
          <div className={styles.statGrid}>
            <StatTile label="Cash on Hand" value={f.cash} formatter={formatMoney} delta={cashDelta} deltaFormatter={formatMoneyShort} />
            <StatTile label="Season Revenue" value={revTotal} formatter={formatMoney} />
            <StatTile label="Season Expense" value={expTotal} formatter={formatMoney} />
            <StatTile label="Net" value={revTotal - expTotal} formatter={formatMoney} />
          </div>
          <div className={styles.ticketRow}>
            <div className={styles.ticketHead}>
              <span>Ticket Price</span>
              <span className={styles.ticketValue}>${ticketPrice}</span>
            </div>
            <input type="range" min={40} max={300} step={5} value={ticketPrice} onChange={(e) => commit(Number(e.target.value))} className={styles.slider} />
            <span className={styles.ticketProjection}>Projected attendance ≈ {attendPct}% of capacity</span>
          </div>
        </SectionCard>

        <Panel title="Revenue" className={styles.panel}>
          {(Object.keys(f.revenue) as RevenueCat[]).map((k) => (
            <BarRow key={k} label={REVENUE_LABEL[k]} value={f.revenue[k]} max={revMax} color="var(--positive)" />
          ))}
        </Panel>

        <Panel title="Expenses" className={styles.panel}>
          {(Object.keys(f.expense) as ExpenseCat[]).map((k) => (
            <BarRow key={k} label={EXPENSE_LABEL[k]} value={f.expense[k]} max={expMax} color="var(--negative)" />
          ))}
        </Panel>
      </div>

      <div className={styles.col}>
        <Panel title="Payroll vs Cap" className={styles.panel}>
          <div className={styles.capBarTrack}>
            <div className={styles.capBarFill} style={{ width: `${Math.min(100, (pay / barMax) * 100)}%` }} />
            {[{ label: 'Cap', value: cap.cap }, { label: 'Tax', value: cap.tax }, { label: 'Apron 1', value: cap.apron1 }, { label: 'Apron 2', value: cap.apron2 }].map((l) => (
              <div key={l.label} className={styles.capBarLine} style={{ left: `${Math.min(100, (l.value / barMax) * 100)}%` }}>
                <span>{l.label}</span>
              </div>
            ))}
          </div>
          <div className={styles.capLegend}>
            <span>Payroll: {formatMoneyShort(pay)}</span>
            <span>Projected Tax: {formatMoneyShort(projTax)}</span>
          </div>
        </Panel>

        <Panel title="Monthly Cash" className={styles.panel}>
          <MonthlyChart monthly={f.monthly} />
        </Panel>

        <Panel title="Recent Attendance" className={styles.panel}>
          {recent.length === 0 ? (
            <div className={styles.chartEmpty}>No home games played yet.</div>
          ) : (
            <div className={styles.attendanceRow}>
              {recent.map((a, i) => (
                <div key={i} className={styles.attendanceBar} style={{ height: `${Math.max(4, a * 100)}%` }} title={`${Math.round(a * 100)}%`} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Hype & Promotions" className={styles.panel} headerRight={<span className={styles.hypeValue}>{Math.round(hype)}</span>}>
          <ProgressBar value={hype} variant={hype >= 65 ? 'positive' : hype <= 35 ? 'negative' : 'cyan'} />
          <div className={styles.themeRow}>
            <span>Theme nights: {themeNights}/{THEME_NIGHT_CAP}</span>
            <button type="button" className={styles.signBtn} disabled={themeNights >= THEME_NIGHT_CAP} onClick={doTheme}>Book Theme Night</button>
          </div>
        </Panel>

        <Panel title="Sponsors" className={styles.panel} flush>
          <div className={styles.sponsorList}>
            {(f.sponsors ?? []).length === 0 && <div className={styles.chartEmpty}>No active sponsors.</div>}
            {(f.sponsors ?? []).map((d) => (
              <div key={d.id} className={styles.sponsorRow}>
                <div className={styles.sponsorInfo}>
                  <span className={styles.sponsorName}>{d.name}</span>
                  <span className={styles.sponsorMeta}>{d.tier} · {formatMoneyShort(d.perSeason)}/yr · {d.years}yr</span>
                </div>
                <span className={styles.sponsorBonus}>{bonusProgress(s, d.bonus)}</span>
              </div>
            ))}
          </div>
          <div className={styles.sponsorDivider}>Available offers</div>
          <div className={styles.sponsorList}>
            {offers.length === 0 && <div className={styles.chartEmpty}>No offers this season.</div>}
            {offers.map((o) => {
              const locked = o.requiresHype > hype;
              return (
                <div key={o.id} className={styles.sponsorRow}>
                  <div className={styles.sponsorInfo}>
                    <span className={styles.sponsorName}>{o.name}</span>
                    <span className={styles.sponsorMeta}>{o.tier} · {formatMoneyShort(o.perSeason)}/yr · {o.years}yr{locked ? ` · needs ${o.requiresHype} hype` : ''}</span>
                  </div>
                  <button type="button" className={styles.signBtn} disabled={locked || (f.sponsors ?? []).length >= 3} onClick={() => doSign(o.id)}>Sign</button>
                </div>
              );
            })}
          </div>
          {note && <div className={styles.sponsorNote}>{note}</div>}
        </Panel>
      </div>
      </div>
    </div>
  );
}
