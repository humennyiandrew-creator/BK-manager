import Panel from '../components/Panel';
import StatRow from '../components/StatRow';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import { useGameState } from '../store/useGame';
import { objectiveLabel } from '../../engine/mgmt/board';
import type { Board } from '../../engine/model';
import styles from './BoardScreen.module.css';

type HistoryRow = Board['history'][number];

function ConfidenceGauge({ value }: { value: number }) {
  const r = 62, cx = 90, cy = 82;
  const angle = (v: number) => Math.PI * (1 - v / 100);
  const point = (v: number): [number, number] => [cx + r * Math.cos(angle(v)), cy - r * Math.sin(angle(v))];
  const [x0, y0] = point(0);
  const [x100, y100] = point(100);
  const [x1, y1] = point(value);
  const color = value >= 65 ? 'var(--positive)' : value >= 35 ? 'var(--cyan)' : 'var(--negative)';
  return (
    <svg viewBox="0 0 180 118" className={styles.gauge}>
      <path d={`M ${x0} ${y0} A ${r} ${r} 0 1 1 ${x100} ${y100}`} stroke="var(--panel-border)" strokeWidth={14} fill="none" strokeLinecap="round" />
      <path d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`} stroke={color} strokeWidth={14} fill="none" strokeLinecap="round" />
      <text x={cx} y={cy - 8} textAnchor="middle" className={styles.gaugeValue}>{Math.round(value)}</text>
      <text x={cx} y={cy + 16} textAnchor="middle" className={styles.gaugeLabel}>CONFIDENCE</text>
    </svg>
  );
}

export default function BoardScreen() {
  const s = useGameState();
  if (!s) return null;
  const b = s.board;

  const columns: DataTableColumn<HistoryRow>[] = [
    { key: 'season', header: 'Season', render: (h) => h.season },
    { key: 'objective', header: 'Objective', render: (h) => objectiveLabel(h.objective) },
    { key: 'result', header: 'Result', render: (h) => h.result },
    { key: 'met', header: 'Met', align: 'right', render: (h) => (h.met ? <span className={styles.met}>Yes</span> : <span className={styles.notMet}>No</span>) },
  ];

  return (
    <div className={styles.wrap}>
      <div className={styles.col}>
        <Panel title="Board of Directors" className={styles.panel}>
          <div className={styles.gaugeWrap}><ConfidenceGauge value={b.confidence} /></div>
          <StatRow label="Season Objective" value={objectiveLabel(b.objective)} />
          <StatRow label="Budget Multiplier" value={`${b.budgetMul.toFixed(2)}x`} variant={b.budgetMul >= 1 ? 'positive' : b.budgetMul < 0.9 ? 'negative' : 'neutral'} />
        </Panel>
        <Panel title="Long-Term Vision" className={styles.panel}>
          <p className={styles.longTerm}>{b.longTerm}</p>
        </Panel>
      </div>
      <Panel title="Season History" className={styles.historyPanel} flush>
        {b.history.length === 0 ? (
          <div className={styles.empty}>No completed seasons yet.</div>
        ) : (
          <DataTable columns={columns} rows={[...b.history].reverse()} rowKey={(h) => h.season} compact />
        )}
      </Panel>
    </div>
  );
}
