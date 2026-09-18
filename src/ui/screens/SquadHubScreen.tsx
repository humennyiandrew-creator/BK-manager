import Panel from '../components/Panel';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import { useGameState } from '../store/useGame';
import { teamRoster } from '../selectors';
import { ageOf } from '../../engine/ratings';
import type { Player } from '../../engine/model';
import { formatMoneyShort } from '../format';
import { CAP_LINES, SALARY_SEASONS } from '../cba';
import styles from './SquadHubScreen.module.css';

function salaryFor(p: Player, season: string) {
  return p.contract?.salaries.find((s) => s.season === season);
}

export default function SquadHubScreen() {
  const s = useGameState();
  if (!s) return null;
  const roster = teamRoster(s, s.userTeamId).slice().sort((a, b) => b.ratings.ovr - a.ratings.ovr);

  const columns: DataTableColumn<Player>[] = [
    { key: 'name', header: 'Player', render: (p) => `${p.firstName} ${p.lastName}` },
    { key: 'type', header: 'Type', render: (p) => p.contract?.type ?? '-' },
    { key: 'age', header: 'Age', align: 'right', render: (p) => Math.floor(ageOf(p.birthDate)) },
    { key: 'ovr', header: 'OVR', align: 'right', render: (p) => p.ratings.ovr },
    ...SALARY_SEASONS.map((season): DataTableColumn<Player> => ({
      key: season,
      header: season,
      align: 'right',
      render: (p) => {
        const line = salaryFor(p, season);
        if (!line) return <span className={styles.noSalary}>—</span>;
        const isOption = p.contract?.option?.season === season;
        const optKind = p.contract?.option?.kind;
        const cls = isOption ? (optKind === 'player' ? styles.optionPlayer : styles.optionTeam) : undefined;
        return <span className={cls}>{formatMoneyShort(line.amount)}</span>;
      }
    }))
  ];

  const totals = SALARY_SEASONS.map((season) => roster.reduce((sum, p) => sum + (salaryFor(p, season)?.amount ?? 0), 0));
  const payroll2627 = totals[0];
  const barMax = CAP_LINES[CAP_LINES.length - 1].value * 1.15;

  return (
    <div className={styles.wrap}>
      <Panel title="Cap Sheet" className={styles.tablePanel} flush>
        <DataTable columns={columns} rows={roster} rowKey={(p) => p.id} compact />
        <div className={styles.totalsRow}>
          <span className={styles.totalsLabel}>Total Payroll</span>
          {totals.map((t, i) => <span key={i} className={styles.totalsValue}>{formatMoneyShort(t)}</span>)}
        </div>
      </Panel>
      <Panel title="2026-27 Payroll vs Cap" className={styles.barPanel}>
        <div className={styles.barTrack}>
          <div className={styles.barFill} style={{ width: `${Math.min(100, (payroll2627 / barMax) * 100)}%` }} />
          {CAP_LINES.map((line) => (
            <div key={line.label} className={styles.barLine} style={{ left: `${Math.min(100, (line.value / barMax) * 100)}%` }}>
              <span className={styles.barLineLabel}>{line.label}</span>
            </div>
          ))}
        </div>
        <div className={styles.barLegend}>
          <span>Payroll: {formatMoneyShort(payroll2627)}</span>
          {CAP_LINES.map((l) => <span key={l.label}>{l.label}: {formatMoneyShort(l.value)}</span>)}
        </div>
        <div className={styles.legendKeys}>
          <span className={styles.optionPlayer}>■</span> Player option
          <span className={styles.optionTeam}>■</span> Team option
        </div>
      </Panel>
    </div>
  );
}
