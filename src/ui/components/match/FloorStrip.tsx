import type { Side, SP } from '../../../engine/sim/fast';
import { tiredness } from '../../../engine/sim/fast';
import styles from './FloorStrip.module.css';

interface Props {
  side: Side;
  opp: Side;
  foulOut: number;
  subOut: string | null;
  onPickCourt: (id: string) => void;
  onPickBench: (id: string) => void;
}

const pct = (e: number) => Math.round(e * 100);
const tone = (e: number) => (e >= 0.75 ? styles.fresh : e >= 0.55 ? styles.tiring : styles.gassed);
const mins = (sp: SP) => `${Math.floor(sp.sec / 60)}:${String(Math.floor(sp.sec % 60)).padStart(2, '0')}`;

/** Your five on the floor and the bench, with legs you can read at a glance. Click a player, then a sub. */
export default function FloorStrip({ side, opp, foulOut, subOut, onPickCourt, onPickBench }: Props) {
  const onCourt = new Set(side.court);
  const bench = side.roster.filter((sp) => !onCourt.has(sp));
  const out = (sp: SP) => !!sp.p.injury || !!sp.hurt || sp.line.pf >= foulOut;
  const theirLegs = opp.court.reduce((x, sp) => x + sp.energy, 0) / Math.max(1, opp.court.length);
  return (
    <div className={styles.strip}>
      <div className={styles.five}>
        {side.court.map((sp) => {
          const t = tiredness(sp);
          return (
            <button key={sp.p.id} type="button" className={`${styles.card} ${sp.p.id === subOut ? styles.selected : ''}`} onClick={() => onPickCourt(sp.p.id)} title="Pick him, then a bench player to sub in">
              <span className={styles.top}>
                <span className={`${styles.num} numeral`}>{sp.p.jersey}</span>
                <span className={styles.name}>{sp.p.lastName}</span>
                <span className={`${styles.pctLabel} ${tone(sp.energy)}`}>{pct(sp.energy)}%</span>
              </span>
              <span className={styles.bar}><span className={tone(sp.energy)} style={{ width: `${pct(sp.energy)}%` }} /><i style={{ left: '75%' }} /></span>
              <span className={styles.meta}>
                <span className={styles.fouls} title={`${sp.line.pf} fouls`}>
                  {Array.from({ length: foulOut }, (_, i) => <i key={i} className={i < sp.line.pf ? (sp.line.pf >= foulOut - 2 ? styles.foulHot : styles.foulOn) : undefined} />)}
                </span>
                <span>{mins(sp)}</span>
                <span className={sp.line.pm > 0 ? styles.plus : sp.line.pm < 0 ? styles.minus : undefined}>{sp.line.pm > 0 ? '+' : ''}{sp.line.pm}</span>
                {t > 0.4 && <span className={styles.warn}>Gassed</span>}
                {t > 0 && t <= 0.4 && <span className={styles.tiringWord}>Tiring</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className={styles.benchRow}>
        <span className={styles.benchLabel}>{subOut ? 'Sub in' : 'Bench'}</span>
        {bench.map((sp) => (
          <button key={sp.p.id} type="button" className={`${styles.chip} ${subOut ? styles.chipLive : ''}`} disabled={!subOut || out(sp)} onClick={() => onPickBench(sp.p.id)}>
            <span className={styles.chipName}>{sp.p.lastName}</span>
            {out(sp)
              ? <span className={styles.chipOut}>{sp.line.pf >= foulOut ? 'Fouled out' : 'Injured'}</span>
              : <span className={styles.chipBar}><span className={tone(sp.energy)} style={{ width: `${pct(sp.energy)}%` }} /></span>}
          </button>
        ))}
        <span className={styles.theirs} title="Average energy of their five on the floor">
          Their legs <b className={tone(theirLegs)}>{pct(theirLegs)}%</b>
        </span>
      </div>
    </div>
  );
}
