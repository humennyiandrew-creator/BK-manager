import type { SeasonArc } from '../../../engine/model';
import { ARC_LABEL } from '../../../engine/arcs';
import styles from './ArcBadge.module.css';

interface Props { arc?: SeasonArc; season: string; showLabel?: boolean; className?: string }

/** "Breakout +6" / "Slump −5" tag for a revealed season arc. Renders nothing otherwise. */
export default function ArcBadge({ arc, season, showLabel, className }: Props) {
  if (!arc?.revealed || arc.season !== season) return null;
  const up = arc.kind === 'breakout';
  return (
    <span className={`${styles.badge} ${up ? styles.up : styles.down} ${className ?? ''}`} title={ARC_LABEL[arc.style]}>
      {up ? 'Breakout' : 'Slump'} <span className="mono-num">{up ? '+' : '−'}{Math.abs(arc.applied)}</span>
      {showLabel && <span className={styles.label}>{ARC_LABEL[arc.style]}</span>}
    </span>
  );
}
