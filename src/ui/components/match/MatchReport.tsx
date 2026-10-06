import type { ReactNode } from 'react';
import type { GameState, MatchObjective } from '../../../engine/model';
import type { Side, SP } from '../../../engine/sim/fast';
import type { LiveMatch } from '../../../engine/sim/live';
import { SCHEMES, SYSTEMS } from '../../../engine/playbook/systems';
import { gameScore } from '../../../engine/news';
import { objectiveStatus, objectiveValue, type ObjCtx } from '../../../engine/objectives';
import BkImage from '../BkImage';
import ObjectiveList from '../hub/ObjectiveList';
import { formatMoneyShort } from '../../format';
import styles from './MatchReport.module.css';

const top8 = (s: Side) => [...s.roster].sort((a, b) => b.p.ratings.ovr - a.p.ratings.ovr).slice(0, 8);
const avgOvr = (s: Side) => Math.round(top8(s).reduce((x, sp) => x + sp.p.ratings.ovr, 0) / Math.max(1, Math.min(8, s.roster.length)));
const minutes = (sp: SP) => sp.sec / 60;

/** Live/final objective context from the match's running box score. */
export function objectiveCtx(match: LiveMatch, userSide: 0 | 1): ObjCtx {
  const lines = (s: Side) => s.roster.map((sp) => ({ ...sp.line, min: minutes(sp) }));
  const us = userSide === 0 ? match.H : match.A, them = userSide === 0 ? match.A : match.H;
  return { us: { lines: lines(us), pts: us.pts }, them: { lines: lines(them), pts: them.pts } };
}

export function objectiveStatusFn(match: LiveMatch, userSide: 0 | 1) {
  const ctx = objectiveCtx(match, userSide);
  const final = match.state === 'final';
  return (o: MatchObjective) => {
    const value = objectiveValue(o, ctx);
    return { status: objectiveStatus(o, value, final), value };
  };
}

// ---------- pregame ----------

interface PreProps { match: LiveMatch; objectives: MatchObjective[] | null; header: ReactNode; actions: ReactNode }

export function PregamePreview({ match, objectives, header, actions }: PreProps) {
  const wp = match.winProb();
  const side = (s: Side, align: 'left' | 'right') => (
    <div className={`${styles.preSide} ${align === 'right' ? styles.preRight : ''}`}>
      <BkImage path={s.team.logo} alt={s.team.abbr} className={styles.preLogo} />
      <span className={styles.preCity}>{s.team.city}</span>
      <span className={styles.preName}>{s.team.name}</span>
      <div className={styles.preStats}>
        <span><b className="mono-num">{avgOvr(s)}</b> Top-8 OVR</span>
        <span>{SYSTEMS[s.team.tactics.offense].name}</span>
        <span>{SCHEMES[s.team.tactics.defense].name}</span>
      </div>
      <div className={styles.preStars}>
        {top8(s).slice(0, 3).map((sp) => (
          <div key={sp.p.id} className={styles.preStar}>
            <BkImage path={sp.p.face} alt={sp.p.lastName} className={styles.preFace} />
            <span className={styles.preStarName}>{sp.p.lastName}</span>
            <span className={`${styles.preOvr} mono-num`}>{sp.p.ratings.ovr}</span>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className={styles.pre}>
      {header}
      <div className={styles.preMain}>
        {side(match.H, 'left')}
        <div className={styles.preCenter}>
          <span className={styles.preVs}>VS</span>
          <span className={styles.preOddsLabel}>Pre-game win chance</span>
          <span className={`${styles.preOdds} mono-num`}>{Math.round(wp * 100)}<small>%</small> <em>{match.H.team.abbr}</em></span>
          <span className={styles.preRules}>{match.rules.periods}×{match.rules.periodSec / 60} min · foul out at {match.rules.foulOut}</span>
        </div>
        {side(match.A, 'right')}
      </div>
      {objectives && (
        <div className={styles.preObj}>
          <span className={styles.subhead}>Sponsor objectives · up to {formatMoneyShort(objectives.reduce((a, o) => a + o.reward, 0))}</span>
          <ObjectiveList list={objectives} />
        </div>
      )}
      {actions}
    </div>
  );
}

// ---------- postgame ----------

export function grade(sp: SP, won: boolean): number {
  const g = 6 + (gameScore(sp.line) - 0.3 * minutes(sp)) / 4 + (won ? 0.3 : -0.1);
  return Math.round(Math.max(3, Math.min(10, g)) * 2) / 2;
}
const gradeClass = (g: number) => (g >= 8 ? styles.gA : g >= 6.5 ? styles.gB : g >= 5 ? styles.gC : styles.gD);

interface PostProps { s: GameState; match: LiveMatch; userSide: 0 | 1; objectives: MatchObjective[] | null; lineScore: ReactNode; actions: ReactNode }

export function PostgameReport({ s, match, userSide, objectives, lineScore, actions }: PostProps) {
  const H = match.H, A = match.A;
  const homeWon = H.pts > A.pts;
  const us = userSide === 0 ? H : A;
  const won = (side: Side) => (side === H ? homeWon : !homeWon);
  const all = [...H.roster.map((sp) => ({ sp, side: H })), ...A.roster.map((sp) => ({ sp, side: A }))].filter((x) => x.sp.sec > 0);
  const potg = all.sort((a, b) => gameScore(b.sp.line) * (won(b.side) ? 1.1 : 1) - gameScore(a.sp.line) * (won(a.side) ? 1.1 : 1))[0];
  const graded = us.roster.filter((sp) => sp.sec > 0).sort((a, b) => b.sec - a.sec);
  const tot = (side: Side, f: (sp: SP) => number) => side.roster.reduce((x, sp) => x + f(sp), 0);
  const pct = (m: number, a: number) => (a ? (m / a) * 100 : 0);
  const rows: { label: string; h: number; a: number; fmt?: (v: number) => string; lowWins?: boolean }[] = [
    { label: 'FG%', h: pct(tot(H, (x) => x.line.fgm), tot(H, (x) => x.line.fga)), a: pct(tot(A, (x) => x.line.fgm), tot(A, (x) => x.line.fga)), fmt: (v) => v.toFixed(1) },
    { label: '3P%', h: pct(tot(H, (x) => x.line.tpm), tot(H, (x) => x.line.tpa)), a: pct(tot(A, (x) => x.line.tpm), tot(A, (x) => x.line.tpa)), fmt: (v) => v.toFixed(1) },
    { label: 'FT%', h: pct(tot(H, (x) => x.line.ftm), tot(H, (x) => x.line.fta)), a: pct(tot(A, (x) => x.line.ftm), tot(A, (x) => x.line.fta)), fmt: (v) => v.toFixed(1) },
    { label: 'Rebounds', h: tot(H, (x) => x.line.orb + x.line.drb), a: tot(A, (x) => x.line.orb + x.line.drb) },
    { label: 'Assists', h: tot(H, (x) => x.line.ast), a: tot(A, (x) => x.line.ast) },
    { label: 'Turnovers', h: tot(H, (x) => x.line.tov), a: tot(A, (x) => x.line.tov), lowWins: true },
    { label: 'Steals', h: tot(H, (x) => x.line.stl), a: tot(A, (x) => x.line.stl) },
    { label: 'Blocks', h: tot(H, (x) => x.line.blk), a: tot(A, (x) => x.line.blk) },
  ];
  const status = objectiveStatusFn(match, userSide);
  const earned = objectives ? objectives.filter((o) => status(o).status === 'met').reduce((x, o) => x + o.reward, 0) : 0;
  const mine = won(us);
  return (
    <div className={styles.post}>
      <div className={styles.postHead}>
        <span className={`${styles.result} ${mine ? styles.win : styles.loss}`}>{mine ? 'Victory' : 'Defeat'}</span>
        <span className={`${styles.final} mono-num`}>
          <BkImage path={H.team.logo} alt={H.team.abbr} className={styles.finalLogo} />{H.team.abbr} {H.pts}
          <i>–</i>
          {A.pts} {A.team.abbr}<BkImage path={A.team.logo} alt={A.team.abbr} className={styles.finalLogo} />
        </span>
      </div>
      {lineScore}
      <div className={styles.postGrid}>
        <div className={styles.postCol}>
          {potg && (
            <div className={styles.potg}>
              <BkImage path={potg.sp.p.face} alt={potg.sp.p.lastName} className={styles.potgFace} />
              <div className={styles.potgText}>
                <span className={styles.subhead}>Player of the game</span>
                <span className={styles.potgName}>{potg.sp.p.firstName} {potg.sp.p.lastName} <em>{potg.side.team.abbr}</em></span>
                <span className="mono-num">{potg.sp.line.pts} pts · {potg.sp.line.orb + potg.sp.line.drb} reb · {potg.sp.line.ast} ast · {potg.sp.line.fgm}/{potg.sp.line.fga} FG</span>
              </div>
            </div>
          )}
          <div className={styles.compare}>
            <div className={styles.cmpHead}><span>{H.team.abbr}</span><span /><span>{A.team.abbr}</span></div>
            {rows.map((r) => {
              const total = r.h + r.a || 1;
              const hBetter = r.lowWins ? r.h < r.a : r.h > r.a;
              const aBetter = r.lowWins ? r.a < r.h : r.a > r.h;
              return (
                <div key={r.label} className={styles.cmpRow}>
                  <span className={`mono-num ${hBetter ? styles.better : ''}`}>{r.fmt ? r.fmt(r.h) : r.h}</span>
                  <span className={styles.cmpMid}>
                    <span className={styles.cmpBar}><span style={{ width: `${(r.h / total) * 100}%`, background: H.team.colors.primary }} /></span>
                    <span className={styles.cmpLabel}>{r.label}</span>
                    <span className={`${styles.cmpBar} ${styles.cmpBarR}`}><span style={{ width: `${(r.a / total) * 100}%`, background: A.team.colors.primary }} /></span>
                  </span>
                  <span className={`mono-num ${aBetter ? styles.better : ''}`}>{r.fmt ? r.fmt(r.a) : r.a}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className={styles.postCol}>
          <span className={styles.subhead}>Player ratings — {us.team.name}</span>
          <div className={styles.grades}>
            {graded.map((sp) => {
              const g = grade(sp, mine);
              return (
                <div key={sp.p.id} className={styles.gradeRow}>
                  <BkImage path={sp.p.face} alt={sp.p.lastName} className={styles.gradeFace} />
                  <span className={styles.gradeName}>{sp.p.lastName}</span>
                  <span className={`${styles.gradeLine} mono-num`}>{Math.round(minutes(sp))}′ · {sp.line.pts}/{sp.line.orb + sp.line.drb}/{sp.line.ast} · {sp.line.pm > 0 ? '+' : ''}{sp.line.pm}</span>
                  <span className={`${styles.gradeBadge} ${gradeClass(g)} mono-num`}>{g.toFixed(1)}</span>
                </div>
              );
            })}
          </div>
          {objectives && (
            <>
              <span className={styles.subhead}>Sponsor objectives · {earned ? `+${formatMoneyShort(earned)}` : 'no bonus'}</span>
              <ObjectiveList list={objectives} status={status} compact />
            </>
          )}
        </div>
      </div>
      {actions}
    </div>
  );
}
