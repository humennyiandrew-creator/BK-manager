import { useState } from 'react';
import Panel from '../components/Panel';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import ConfirmDialog from '../components/ConfirmDialog';
import BkImage from '../components/BkImage';
import { useGame, useGameState } from '../store/useGame';
import { teamRoster } from '../selectors';
import { ageOf } from '../../engine/ratings';
import type { GameState, Player } from '../../engine/model';
import { releasePlayer } from '../../engine/freeagency';
import { expiring, resignAsk, resignPlayer } from '../../engine/offseason';
import { capNumbers, isTwoWay, payroll as cbaPayroll, seasonLabel } from '../../engine/cba';
import { formatMoney, formatMoneyShort } from '../format';
import { CAP_LINES, SALARY_SEASONS } from '../cba';
import styles from './SquadHubScreen.module.css';

type Mutate = (fn: (s: GameState) => void) => void;

function salaryFor(p: Player, season: string) {
  return p.contract?.salaries.find((s) => s.season === season);
}

function deadCapAmount(p: Player, season: string): number {
  if (!p.contract || isTwoWay(p)) return 0;
  return p.contract.salaries.filter((x) => x.season >= season).reduce((sum, x) => sum + x.amount, 0);
}

function CapSheetTab({ s, mutate }: { s: GameState; mutate: Mutate }) {
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const roster = teamRoster(s, s.userTeamId).slice().sort((a, b) => b.ratings.ovr - a.ratings.ovr);
  const releaseTarget = releaseId ? s.players[releaseId] : null;

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
    })),
    {
      key: 'release', header: '', align: 'right', render: (p) => (
        <button type="button" className={styles.releaseBtn} onClick={() => setReleaseId(p.id)}>Release</button>
      )
    }
  ];

  const totals = SALARY_SEASONS.map((season) => roster.reduce((sum, p) => sum + (salaryFor(p, season)?.amount ?? 0), 0));
  const payroll2627 = totals[0];
  const barMax = CAP_LINES[CAP_LINES.length - 1].value * 1.15;

  return (
    <div className={styles.capGrid}>
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
      {releaseTarget && (
        <ConfirmDialog
          title={`Release ${releaseTarget.firstName} ${releaseTarget.lastName}?`}
          message={`Remaining salary stays on the books as dead cap: ${formatMoney(deadCapAmount(releaseTarget, s.season))}.`}
          confirmLabel="Release"
          danger
          onCancel={() => setReleaseId(null)}
          onConfirm={() => { mutate((st) => releasePlayer(st, releaseTarget.id)); setReleaseId(null); }}
        />
      )}
    </div>
  );
}

function ResignOfferModal({ s, mutate, player, ask, onClose }: { s: GameState; mutate: Mutate; player: Player; ask: { amount: number; years: number }; onClose: () => void }) {
  const [amount, setAmount] = useState(ask.amount);
  const [years, setYears] = useState(ask.years);
  const [error, setError] = useState<string | null>(null);
  const min = Math.round(ask.amount * 0.6 / 10_000) * 10_000;
  const max = Math.round(ask.amount * 1.6 / 10_000) * 10_000;

  const submit = () => {
    let result: string | null = null;
    mutate((st) => { result = resignPlayer(st, player.id, amount, years); });
    if (result) setError(result); else onClose();
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.offerModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.offerModalHead}>
          <BkImage path={player.face} alt={player.lastName} className={styles.offerModalFace} />
          <div>
            <div className={styles.offerModalName}>{player.firstName} {player.lastName}</div>
            <div className={styles.offerModalMeta}>{player.positions.join('/')} · OVR {player.ratings.ovr} · Wants {formatMoneyShort(ask.amount)} / {ask.years}y</div>
          </div>
        </div>
        <label className={styles.offerField}>
          <span>Amount: {formatMoney(amount)}</span>
          <input type="range" min={min} max={max} step={10_000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </label>
        <label className={styles.offerField}>
          <span>Years: {years}</span>
          <input type="range" min={1} max={5} step={1} value={years} onChange={(e) => setYears(Number(e.target.value))} />
        </label>
        {error && <div className={styles.legalBad}>{error}</div>}
        <div className={styles.offerModalBtns}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.proposeBtn} onClick={submit}>Offer</button>
        </div>
      </div>
    </div>
  );
}

function ResignTab({ s, mutate }: { s: GameState; mutate: Mutate }) {
  const [letGo, setLetGo] = useState<Set<string>>(new Set());
  const [offerId, setOfferId] = useState<string | null>(null);
  const list = expiring(s, s.userTeamId);
  const next = seasonLabel(s.seasonYear + 1);
  const cap = capNumbers(s.seasonYear + 1);
  const pay = cbaPayroll(s, s.userTeamId, next);
  const offering = offerId ? s.players[offerId] : null;

  const toggleLetGo = (id: string) => setLetGo((set) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const columns: DataTableColumn<Player>[] = [
    { key: 'face', header: '', render: (p) => <BkImage path={p.face} alt={p.lastName} className={styles.faceThumb} /> },
    { key: 'name', header: 'Player', render: (p) => `${p.firstName} ${p.lastName}` },
    { key: 'pos', header: 'Pos', render: (p) => p.positions.join('/') },
    { key: 'age', header: 'Age', align: 'right', render: (p) => Math.floor(ageOf(p.birthDate)) },
    { key: 'ovrpot', header: 'OVR/POT', align: 'right', render: (p) => `${p.ratings.ovr}/${p.ratings.pot}` },
    {
      key: 'last', header: 'Last Season', render: (p) => {
        const h = p.history[0];
        return h ? `${(h.pts / Math.max(1, h.gp)).toFixed(1)} PPG, ${h.gp} GP` : '—';
      }
    },
    { key: 'salary', header: 'Current Salary', align: 'right', render: (p) => (p.contract ? formatMoneyShort(salaryFor(p, s.season)?.amount ?? 0) : '—') },
    { key: 'ask', header: 'Asking', align: 'right', render: (p) => { const a = resignAsk(s, p); return `${formatMoneyShort(a.amount)} / ${a.years}y`; } },
    {
      key: 'actions', header: '', align: 'right', render: (p) => letGo.has(p.id) ? (
        <span className={styles.letGoTag}>
          Letting go <button type="button" className={styles.undoBtn} onClick={() => toggleLetGo(p.id)}>Undo</button>
        </span>
      ) : (
        <span className={styles.resignActions}>
          <button type="button" className={styles.offerBtn} onClick={() => setOfferId(p.id)}>Offer</button>
          <button type="button" className={styles.letGoBtn} onClick={() => toggleLetGo(p.id)}>Let go</button>
        </span>
      )
    }
  ];

  return (
    <div className={styles.resignWrap}>
      <div className={styles.resignHeader}>
        <span>Payroll {next}: {formatMoneyShort(pay)}</span>
        <span>Cap: {formatMoneyShort(cap.cap)}</span>
        <span>Room: {formatMoneyShort(cap.cap - pay)}</span>
        <span>Expiring: {list.length}</span>
      </div>
      <Panel title="Expiring Contracts" className={styles.tablePanel} flush>
        {list.length === 0 && <div className={styles.empty}>No expiring contracts this summer.</div>}
        {list.length > 0 && <DataTable columns={columns} rows={list} rowKey={(p) => p.id} compact />}
      </Panel>
      {offering && <ResignOfferModal s={s} mutate={mutate} player={offering} ask={resignAsk(s, offering)} onClose={() => setOfferId(null)} />}
    </div>
  );
}

export default function SquadHubScreen() {
  const s = useGameState();
  const mutate = useGame((g) => g.mutate);
  const [tab, setTab] = useState<'cap' | 'resign'>(() => (s?.offseason?.stage === 'resign' ? 'resign' : 'cap'));
  if (!s) return null;
  const showResign = s.offseason?.stage === 'resign';
  const activeTab = showResign ? tab : 'cap';

  return (
    <div className={styles.screenWrap}>
      {showResign && (
        <div className={styles.subTabs}>
          <button type="button" className={activeTab === 'cap' ? `${styles.subTab} ${styles.subTabActive}` : styles.subTab} onClick={() => setTab('cap')}>Cap Sheet</button>
          <button type="button" className={activeTab === 'resign' ? `${styles.subTab} ${styles.subTabActive}` : styles.subTab} onClick={() => setTab('resign')}>
            Re-sign{expiring(s, s.userTeamId).length ? ` (${expiring(s, s.userTeamId).length})` : ''}
          </button>
        </div>
      )}
      {activeTab === 'cap' && <CapSheetTab s={s} mutate={mutate} />}
      {activeTab === 'resign' && <ResignTab s={s} mutate={mutate} />}
    </div>
  );
}
