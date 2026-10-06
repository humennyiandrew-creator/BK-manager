import { useState } from 'react';
import type { FlowPoint, ShotMark } from '../../../engine/sim/live';
import type { Rules } from '../../../engine/sim/fast';
import styles from './MatchCharts.module.css';

interface FlowProps { flow: FlowPoint[]; rules: Rules; homeColor: string; awayColor: string; homeAbbr: string; awayAbbr: string }

/** Score margin over game time (home above the line) with the win-probability trace on top. */
export function FlowChart({ flow, rules, homeColor, awayColor, homeAbbr, awayAbbr }: FlowProps) {
  const W = 320, H = 170, pad = 6;
  const reg = rules.periods * rules.periodSec;
  const tMax = Math.max(reg, flow.at(-1)?.t ?? reg);
  const mMax = Math.max(10, ...flow.map((f) => Math.abs(f.margin)));
  const x = (t: number) => pad + (t / tMax) * (W - pad * 2);
  const y = (m: number) => H / 2 - (m / mMax) * (H / 2 - pad);
  const yw = (wp: number) => pad + (1 - wp) * (H - pad * 2);
  const pts = flow.map((f) => `${x(f.t).toFixed(1)},${y(f.margin).toFixed(1)}`).join(' ');
  const area = flow.length ? `M${x(flow[0].t)},${H / 2} L${pts.replace(/ /g, ' L')} L${x(flow.at(-1)!.t)},${H / 2} Z` : '';
  const wpPts = flow.map((f) => `${x(f.t).toFixed(1)},${yw(f.wp).toFixed(1)}`).join(' ');
  const last = flow.at(-1);
  const biggest = flow.reduce((b, f) => (Math.abs(f.margin) > Math.abs(b.margin) ? f : b), flow[0] ?? { t: 0, margin: 0, wp: 0.5 });
  const leadChanges = flow.reduce((n, f, i) => (i && Math.sign(f.margin) && Math.sign(flow[i - 1].margin) && Math.sign(f.margin) !== Math.sign(flow[i - 1].margin) ? n + 1 : n), 0);
  return (
    <div className={styles.flowWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.flow}>
        <defs>
          <clipPath id="flowTop"><rect x="0" y="0" width={W} height={H / 2} /></clipPath>
          <clipPath id="flowBottom"><rect x="0" y={H / 2} width={W} height={H / 2} /></clipPath>
        </defs>
        {Array.from({ length: rules.periods - 1 }, (_, i) => (
          <line key={i} x1={x((i + 1) * rules.periodSec)} x2={x((i + 1) * rules.periodSec)} y1={0} y2={H} className={styles.grid} />
        ))}
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} className={styles.axis} />
        {area && <path d={area} fill={homeColor} opacity={0.35} clipPath="url(#flowTop)" />}
        {area && <path d={area} fill={awayColor} opacity={0.35} clipPath="url(#flowBottom)" />}
        <polyline points={pts} className={styles.marginLine} />
        <polyline points={wpPts} className={styles.wpLine} />
      </svg>
      <div className={styles.flowLegend}>
        <span><i style={{ background: homeColor }} />{homeAbbr} lead</span>
        <span><i style={{ background: awayColor }} />{awayAbbr} lead</span>
        <span><i className={styles.wpSwatch} />{homeAbbr} win prob.</span>
      </div>
      <div className={styles.flowStats}>
        <div><span>Win prob.</span><b className="mono-num">{homeAbbr} {Math.round((last?.wp ?? 0.5) * 100)}%</b></div>
        <div><span>Biggest lead</span><b className="mono-num">{biggest.margin === 0 ? '—' : `${biggest.margin > 0 ? homeAbbr : awayAbbr} +${Math.abs(biggest.margin)}`}</b></div>
        <div><span>Lead changes</span><b className="mono-num">{leadChanges}</b></div>
      </div>
    </div>
  );
}

interface ShotProps { shots: ShotMark[]; homeAbbr: string; awayAbbr: string; nameOf: (id: string) => string }

const zone = (s: ShotMark) => (s.three ? '3PT' : Math.hypot(s.x - 5.25, s.y - 25) <= 8 ? 'Paint' : 'Mid');

/** Half-court shot chart for either team, with zone splits. */
export function ShotChart({ shots, homeAbbr, awayAbbr, nameOf }: ShotProps) {
  const [side, setSide] = useState<0 | 1>(0);
  const mine = shots.filter((s) => s.side === side);
  const zones = ['Paint', 'Mid', '3PT'].map((z) => {
    const list = mine.filter((s) => zone(s) === z);
    const made = list.filter((s) => s.made).length;
    return { z, made, att: list.length };
  });
  const hot = Object.entries(mine.reduce<Record<string, { m: number; a: number }>>((acc, s) => {
    (acc[s.id] ??= { m: 0, a: 0 }).a++;
    if (s.made) acc[s.id].m++;
    return acc;
  }, {})).sort((a, b) => b[1].a - a[1].a).slice(0, 4);
  return (
    <div className={styles.shotWrap}>
      <div className={styles.sideToggle}>
        {[homeAbbr, awayAbbr].map((abbr, i) => (
          <button key={abbr} type="button" className={side === i ? `${styles.sideBtn} ${styles.sideOn}` : styles.sideBtn} onClick={() => setSide(i as 0 | 1)}>{abbr}</button>
        ))}
      </div>
      <svg viewBox="0 0 50 47" className={styles.court}>
        <g transform="rotate(-90 23.5 23.5)">
          <rect x="0" y="0" width="47" height="50" className={styles.courtLine} />
          <rect x="0" y="17" width="19" height="16" className={styles.courtLine} />
          <circle cx="19" cy="25" r="6" className={styles.courtLine} />
          <path d="M0 3 H14 A23.75 23.75 0 0 1 14 47 H0" className={styles.courtLine} />
          <circle cx="5.25" cy="25" r="0.75" className={styles.rim} />
          {mine.map((s, i) => s.made
            ? <circle key={i} cx={s.x} cy={s.y} r={0.75} className={styles.made} />
            : <g key={i} className={styles.miss}><line x1={s.x - 0.6} y1={s.y - 0.6} x2={s.x + 0.6} y2={s.y + 0.6} /><line x1={s.x - 0.6} y1={s.y + 0.6} x2={s.x + 0.6} y2={s.y - 0.6} /></g>)}
        </g>
      </svg>
      <div className={styles.zones}>
        {zones.map((z) => (
          <div key={z.z} className={styles.zoneCell}>
            <span>{z.z}</span>
            <b className="mono-num">{z.made}/{z.att}</b>
            <em className="mono-num">{z.att ? Math.round((z.made / z.att) * 100) : 0}%</em>
          </div>
        ))}
      </div>
      <div className={styles.shooters}>
        {hot.map(([id, v]) => <span key={id}>{nameOf(id)} <b className="mono-num">{v.m}/{v.a}</b></span>)}
      </div>
    </div>
  );
}
