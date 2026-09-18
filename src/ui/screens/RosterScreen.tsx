import { useMemo, useState } from 'react';
import Panel from '../components/Panel';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import BkImage from '../components/BkImage';
import ProgressBar from '../components/ProgressBar';
import { useGameState } from '../store/useGame';
import { teamRoster } from '../selectors';
import { ageOf } from '../../engine/ratings';
import type { Player } from '../../engine/model';
import { ATTR_GROUPS, ATTR_LABEL, attrVariant } from '../attrGroups';
import { formatMoney, heightFtIn, perGame } from '../format';
import styles from './RosterScreen.module.css';

type SortKey = 'jersey' | 'name' | 'pos' | 'age' | 'height' | 'ovr' | 'pot' | 'ppg' | 'rpg' | 'apg' | 'salary';

const SORTERS: Record<SortKey, (p: Player) => number | string> = {
  jersey: (p) => Number(p.jersey) || 0,
  name: (p) => p.lastName,
  pos: (p) => p.positions[0] ?? '',
  age: (p) => ageOf(p.birthDate),
  height: (p) => p.heightCm,
  ovr: (p) => p.ratings.ovr,
  pot: (p) => p.ratings.pot,
  ppg: (p) => (p.season.gp ? p.season.pts / p.season.gp : 0),
  rpg: (p) => (p.season.gp ? (p.season.orb + p.season.drb) / p.season.gp : 0),
  apg: (p) => (p.season.gp ? p.season.ast / p.season.gp : 0),
  salary: (p) => p.contract?.salaries[0]?.amount ?? 0
};

function moraleLabel(m: number): { text: string; variant: 'positive' | 'muted' | 'negative' } {
  if (m >= 70) return { text: 'Happy', variant: 'positive' };
  if (m >= 40) return { text: 'Neutral', variant: 'muted' };
  return { text: 'Unhappy', variant: 'negative' };
}

export default function RosterScreen() {
  const s = useGameState();
  const [sortKey, setSortKey] = useState<SortKey>('ovr');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const roster = useMemo(() => (s ? teamRoster(s, s.userTeamId) : []), [s]);
  const sorted = useMemo(() => {
    const fn = SORTERS[sortKey];
    return [...roster].sort((a, b) => {
      const va = fn(a), vb = fn(b);
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return cmp * sortDir;
    });
  }, [roster, sortKey, sortDir]);

  if (!s) return null;
  const selected = selectedId ? s.players[selectedId] : sorted[0];

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1) as 1 | -1);
    else { setSortKey(key); setSortDir(key === 'name' || key === 'pos' ? 1 : -1); }
  };

  const th = (key: SortKey, label: string) => (
    <button type="button" className={styles.sortHead} onClick={() => toggleSort(key)}>
      {label}{sortKey === key && <span className={styles.sortArrow}>{sortDir === 1 ? '▲' : '▼'}</span>}
    </button>
  );

  const columns: DataTableColumn<Player>[] = [
    { key: 'jersey', header: th('jersey', '#'), render: (p) => p.jersey },
    { key: 'face', header: '', render: (p) => <BkImage path={p.face} alt={p.lastName} className={styles.faceThumb} /> },
    { key: 'name', header: th('name', 'Name'), render: (p) => `${p.firstName} ${p.lastName}` },
    { key: 'pos', header: th('pos', 'Pos'), render: (p) => p.positions.join('/') },
    { key: 'age', header: th('age', 'Age'), align: 'right', render: (p) => Math.floor(ageOf(p.birthDate)) },
    { key: 'height', header: th('height', 'Ht'), align: 'right', render: (p) => heightFtIn(p.heightCm) },
    { key: 'ovr', header: th('ovr', 'OVR'), align: 'right', render: (p) => p.ratings.ovr },
    { key: 'pot', header: th('pot', 'POT'), align: 'right', render: (p) => p.ratings.pot },
    { key: 'ppg', header: th('ppg', 'PPG'), align: 'right', render: (p) => perGame(p.season.pts, p.season.gp) },
    { key: 'rpg', header: th('rpg', 'RPG'), align: 'right', render: (p) => perGame(p.season.orb + p.season.drb, p.season.gp) },
    { key: 'apg', header: th('apg', 'APG'), align: 'right', render: (p) => perGame(p.season.ast, p.season.gp) },
    {
      key: 'status', header: 'Status', render: (p) => {
        if (p.injury) return <span className={styles.chipNegative}>{p.injury.name}</span>;
        const m = moraleLabel(p.morale);
        return <span className={styles[`chip${m.variant === 'positive' ? 'Positive' : m.variant === 'negative' ? 'Negative' : 'Muted'}`]}>{m.text}</span>;
      }
    },
    {
      key: 'salary', header: th('salary', 'Contract'), align: 'right', render: (p) => {
        if (!p.contract) return '-';
        const amt = p.contract.salaries[0]?.amount ?? 0;
        return `${formatMoney(amt)} · ${p.contract.salaries.length}yr`;
      }
    }
  ];

  return (
    <div className={styles.wrap}>
      <Panel title="Roster" className={styles.tablePanel} flush>
        <DataTable columns={columns} rows={sorted} rowKey={(p) => p.id} highlightedRowKey={selected?.id} onRowClick={(p) => setSelectedId(p.id)} compact />
      </Panel>
      <Panel title="Player Detail" className={styles.detailPanel}>
        {selected && <PlayerDetail player={selected} />}
      </Panel>
    </div>
  );
}

function PlayerDetail({ player: p }: { player: Player }) {
  const age = Math.floor(ageOf(p.birthDate));
  return (
    <div className={styles.detail}>
      <div className={styles.detailHead}>
        <BkImage path={p.face} alt={p.lastName} className={styles.detailFace} />
        <div>
          <div className={styles.detailName}>{p.firstName} {p.lastName}</div>
          <div className={styles.detailMeta}>
            #{p.jersey} · {p.positions.join('/')} · {age}y · {heightFtIn(p.heightCm)} · {p.weightKg}kg · {p.country}
          </div>
          <div className={styles.detailMeta}>
            {p.draft ? `Draft ${p.draft.year} R${p.draft.round} P${p.draft.pick}` : 'Undrafted'} · OVR {p.ratings.ovr} · POT {p.ratings.pot}
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Season</div>
        <div className={styles.statLine}>
          <span>PPG {perGame(p.season.pts, p.season.gp)}</span>
          <span>RPG {perGame(p.season.orb + p.season.drb, p.season.gp)}</span>
          <span>APG {perGame(p.season.ast, p.season.gp)}</span>
          <span>GP {p.season.gp}</span>
        </div>
      </div>

      <div className={styles.attrGrid}>
        {ATTR_GROUPS.map((g) => (
          <div key={g.label} className={styles.attrGroup}>
            <div className={styles.sectionTitle}>{g.label}</div>
            {g.attrs.map((a) => (
              <div key={a} className={styles.attrRow}>
                <span className={styles.attrLabel}>{ATTR_LABEL[a]}</span>
                <ProgressBar value={p.ratings.attrs[a]} variant={attrVariant(p.ratings.attrs[a])} className={styles.attrBar} />
                <span className={styles.attrValue}>{p.ratings.attrs[a]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Tendencies</div>
        <div className={styles.statLine}>
          <span>USG {(p.ratings.tend.usage * 100).toFixed(0)}%</span>
          <span>3PT Rate {(p.ratings.tend.threeRate * 100).toFixed(0)}%</span>
          <span>Rim Rate {(p.ratings.tend.rimRate * 100).toFixed(0)}%</span>
          <span>FT Rate {(p.ratings.tend.ftRate * 100).toFixed(0)}%</span>
        </div>
      </div>

      {p.history.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>History</div>
          <table className={styles.historyTable}>
            <thead>
              <tr><th>Season</th><th>Team</th><th>GP</th><th>PPG</th><th>RPG</th><th>APG</th></tr>
            </thead>
            <tbody>
              {p.history.map((h) => (
                <tr key={h.season}>
                  <td>{h.season}</td><td>{h.team}</td><td>{h.gp}</td>
                  <td>{perGame(h.pts, h.gp)}</td><td>{perGame(h.orb + h.drb, h.gp)}</td><td>{perGame(h.ast, h.gp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
