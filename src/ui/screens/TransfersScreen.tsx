import { useEffect, useMemo, useState } from 'react';
import Panel from '../components/Panel';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import BkImage from '../components/BkImage';
import TeamBadge from '../components/TeamBadge';
import { useGame, useGameState } from '../store/useGame';
import { useTransfersNav } from '../store/useTransfersNav';
import { ageOf } from '../../engine/ratings';
import type { DraftPick, GameState, Player, TradeSide } from '../../engine/model';
import { evaluateTrade, playerValue, pickValue, proposeTrade, respondToOffer, tradeLegal, tradeWindowOpen } from '../../engine/trade';
import { askingPrice, freeAgents, offerContract } from '../../engine/freeagency';
import { capNumbers, isTwoWay, marketValue, maxSalary, minSalary, payroll as cbaPayroll, rosterOf, salaryIn, signingCheck, yearsLeft } from '../../engine/cba';
import { formatDate, formatMoney, formatMoneyShort } from '../format';
import styles from './TransfersScreen.module.css';

type SubTab = 'trade' | 'offers' | 'fa' | 'tx';
type Asset = { kind: 'player'; id: string; player: Player } | { kind: 'pick'; id: string; pick: DraftPick };
type Mutate = (fn: (s: GameState) => void) => void;

function teamAssets(s: GameState, teamId: string): Asset[] {
  const players = Object.values(s.players)
    .filter((p) => p.teamId === teamId)
    .sort((a, b) => b.ratings.ovr - a.ratings.ovr)
    .map((player): Asset => ({ kind: 'player', id: player.id, player }));
  const picks = s.picks
    .filter((p) => p.owner === teamId && p.year > s.seasonYear)
    .sort((a, b) => a.year - b.year || a.round - b.round)
    .map((pick): Asset => ({ kind: 'pick', id: pick.id, pick }));
  return [...players, ...picks];
}

const sideOf = (a: Asset): 'players' | 'picks' => (a.kind === 'player' ? 'players' : 'picks');

function toggleAsset(side: TradeSide, a: Asset): TradeSide {
  const key = sideOf(a);
  const has = side[key].includes(a.id);
  return { ...side, [key]: has ? side[key].filter((id) => id !== a.id) : [...side[key], a.id] };
}

const sideSalary = (s: GameState, side: TradeSide) => side.players.reduce((sum, id) => sum + salaryIn(s.players[id], s.season), 0);

function sideValue(s: GameState, side: TradeSide): number {
  return side.players.reduce((x, id) => x + playerValue(s, s.players[id]), 0)
    + side.picks.reduce((x, id) => { const p = s.picks.find((y) => y.id === id); return p ? x + pickValue(s, p) : x; }, 0);
}

function describeSide(s: GameState, side: TradeSide): string {
  const parts = [
    ...side.players.map((id) => s.players[id] ? `${s.players[id].firstName} ${s.players[id].lastName}` : id),
    ...side.picks.map((id) => {
      const p = s.picks.find((x) => x.id === id);
      return p ? `${p.year} R${p.round}${p.original !== p.owner ? ` (via ${s.teams[p.original].abbr})` : ''}` : id;
    }),
  ];
  return parts.length ? parts.join(', ') : 'Nothing';
}

function interestMeter(margin: number) {
  const pct = Math.max(4, Math.min(100, ((margin + 60) / 70) * 100));
  const color = margin >= 5 ? 'var(--positive)' : margin >= -15 ? 'var(--cyan)' : margin >= -40 ? '#e2b93b' : 'var(--negative)';
  const label = margin >= 5 ? 'Deal' : margin >= -15 ? 'Warm' : margin >= -40 ? 'Cool' : 'Cold';
  return { pct, color, label };
}

function AssetTable({ s, teamId, selected, onToggle }: { s: GameState; teamId: string; selected: TradeSide; onToggle: (a: Asset) => void }) {
  const assets = useMemo(() => teamAssets(s, teamId), [s, teamId]);
  const isSelected = (a: Asset) => selected[sideOf(a)].includes(a.id);
  const columns: DataTableColumn<Asset>[] = [
    {
      key: 'face', header: '', render: (a) => a.kind === 'player'
        ? <BkImage path={a.player.face} alt={a.player.lastName} className={styles.faceThumb} />
        : <BkImage path={s.teams[a.pick.original]?.logo ?? null} alt={a.pick.original} className={styles.pickLogo} />
    },
    {
      key: 'name', header: 'Asset', render: (a) => a.kind === 'player'
        ? `${a.player.firstName} ${a.player.lastName}`
        : `${a.pick.year} R${a.pick.round}${a.pick.original !== a.pick.owner ? ` (${s.teams[a.pick.original]?.abbr})` : ''}`
    },
    { key: 'pos', header: 'Pos', render: (a) => (a.kind === 'player' ? a.player.positions.join('/') : '-') },
    { key: 'age', header: 'Age', align: 'right', render: (a) => (a.kind === 'player' ? Math.floor(ageOf(a.player.birthDate)) : '-') },
    { key: 'ovr', header: 'OVR/POT', align: 'right', render: (a) => (a.kind === 'player' ? `${a.player.ratings.ovr}/${a.player.ratings.pot}` : '-') },
    {
      key: 'sal', header: 'Salary', align: 'right', render: (a) => a.kind === 'player'
        ? (a.player.contract ? `${formatMoneyShort(salaryIn(a.player, s.season))} · ${yearsLeft(a.player, s.season)}y` : '-')
        : '-'
    },
  ];
  return (
    <DataTable columns={columns} rows={assets} rowKey={(a) => a.id} onRowClick={onToggle} rowClass={(a) => (isSelected(a) ? styles.assetSelected : undefined)} compact />
  );
}

function TradeCenter({ s, mutate }: { s: GameState; mutate: Mutate }) {
  const aiTeams = useMemo(() => Object.values(s.teams).filter((t) => t.id !== s.userTeamId).sort((a, b) => a.city.localeCompare(b.city)), [s.teams, s.userTeamId]);
  const [aiTeamId, setAiTeamId] = useState(aiTeams[0]?.id ?? '');
  const [youSend, setYouSend] = useState<TradeSide>({ players: [], picks: [] });
  const [theySend, setTheySend] = useState<TradeSide>({ players: [], picks: [] });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { setYouSend({ players: [], picks: [] }); setTheySend({ players: [], picks: [] }); }, [aiTeamId]);

  if (!aiTeamId) return <div className={styles.empty}>No trade partners available</div>;

  const open = tradeWindowOpen(s);
  const legal = tradeLegal(s, s.userTeamId, aiTeamId, youSend, theySend);
  const ev = evaluateTrade(s, aiTeamId, theySend, youSend);
  const hasAssets = youSend.players.length + youSend.picks.length + theySend.players.length + theySend.picks.length > 0;
  const meter = hasAssets ? interestMeter(ev.margin) : { label: '—', pct: 0, color: 'transparent' };
  const canPropose = open && !legal && hasAssets;

  const propose = () => {
    let result: { ok: boolean; text: string } | undefined;
    mutate((st) => { result = proposeTrade(st, aiTeamId, youSend, theySend); });
    if (result) {
      setToast(result.text);
      if (result.ok) { setYouSend({ players: [], picks: [] }); setTheySend({ players: [], picks: [] }); }
      setTimeout(() => setToast(null), 3500);
    }
  };

  return (
    <div className={styles.tradeCenter}>
      <div className={styles.teamPicker}>
        {aiTeams.map((t) => (
          <button key={t.id} type="button" className={t.id === aiTeamId ? `${styles.teamPick} ${styles.teamPickActive}` : styles.teamPick} onClick={() => setAiTeamId(t.id)} title={`${t.city} ${t.name}`}>
            <BkImage path={t.logo} alt={t.abbr} className={styles.teamPickLogo} />
          </button>
        ))}
      </div>
      <div className={styles.tradeGrid}>
        <Panel title="You Send" className={styles.tradeCol} flush>
          <AssetTable s={s} teamId={s.userTeamId} selected={youSend} onToggle={(a) => setYouSend((side) => toggleAsset(side, a))} />
        </Panel>
        <Panel title="Trade Terms" className={styles.tradeMid}>
          <div className={styles.dealHint}>Trade deadline: {formatDate(s.keyDates.tradeDeadline)}{!open && ' — CLOSED'}</div>
          <div className={styles.salaryRow}><span>Salary Out</span><span>{formatMoneyShort(sideSalary(s, youSend))}</span></div>
          <div className={styles.salaryRow}><span>Salary In</span><span>{formatMoneyShort(sideSalary(s, theySend))}</span></div>
          <div className={legal ? styles.legalBad : styles.legalOk}>{legal ?? 'Trade is legal'}</div>
          <div className={styles.meterWrap}>
            <div className={styles.meterLabel}>AI Interest — {meter.label}</div>
            <div className={styles.meterTrack}><div className={styles.meterFill} style={{ width: `${meter.pct}%`, background: meter.color }} /></div>
            <div className={styles.meterReason}>{hasAssets ? ev.reason : 'Select players or picks on both sides.'}</div>
          </div>
          <button type="button" className={styles.proposeBtn} disabled={!canPropose} onClick={propose}>Propose Trade</button>
          {toast && <div className={styles.toast}>{toast}</div>}
        </Panel>
        <Panel title="You Receive" className={styles.tradeCol} flush>
          <AssetTable s={s} teamId={aiTeamId} selected={theySend} onToggle={(a) => setTheySend((side) => toggleAsset(side, a))} />
        </Panel>
      </div>
    </div>
  );
}

function OffersTab({ s, mutate }: { s: GameState; mutate: Mutate }) {
  const [toast, setToast] = useState<string | null>(null);
  const respond = (id: number, accept: boolean) => {
    let result: string | undefined;
    mutate((st) => { result = respondToOffer(st, id, accept); });
    if (result) { setToast(result); setTimeout(() => setToast(null), 3000); }
  };
  return (
    <Panel title="Incoming Offers" className={styles.offersPanel} flush>
      {toast && <div className={styles.toast}>{toast}</div>}
      {s.tradeOffers.length === 0 && <div className={styles.empty}>No pending offers</div>}
      <div className={styles.offerList}>
        {s.tradeOffers.map((o) => (
          <div key={o.id} className={styles.offerCard}>
            <TeamBadge logoPath={s.teams[o.from]?.logo ?? null} name={`${s.teams[o.from]?.city ?? ''} ${s.teams[o.from]?.name ?? ''}`} className={styles.offerTeam} />
            <div className={styles.offerBody}>
              <div><span className={styles.offerLabel}>You receive</span> {describeSide(s, o.give)} <span className={styles.offerValue}>({Math.round(sideValue(s, o.give))})</span></div>
              <div><span className={styles.offerLabel}>You send</span> {describeSide(s, o.get)} <span className={styles.offerValue}>({Math.round(sideValue(s, o.get))})</span></div>
              <div className={styles.offerExpiry}>Expires {formatDate(o.expires)}</div>
            </div>
            <div className={styles.offerBtns}>
              <button type="button" className={styles.acceptBtn} onClick={() => respond(o.id, true)}>Accept</button>
              <button type="button" className={styles.declineBtn} onClick={() => respond(o.id, false)}>Decline</button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

type FaSortKey = 'name' | 'pos' | 'age' | 'ovr' | 'pot' | 'ask' | 'mv';
interface FaRow { p: Player; ask: { amount: number; years: number }; mv: number }

function OfferModal({ s, mutate, player, ask, onClose }: { s: GameState; mutate: Mutate; player: Player; ask: { amount: number; years: number }; onClose: () => void }) {
  const eligibleTwoWay = player.yearsPro <= 4 && player.ratings.ovr <= 72;
  const [amount, setAmount] = useState(ask.amount);
  const [years, setYears] = useState(ask.years);
  const [twoWay, setTwoWay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const min = minSalary(s.seasonYear, player.yearsPro);
  const max = Math.max(maxSalary(s.seasonYear, player.yearsPro), ask.amount);
  const check = signingCheck(s, s.userTeamId, player, twoWay ? 0 : amount, twoWay);

  const submit = () => {
    let result: string | null = null;
    mutate((st) => { result = offerContract(st, st.userTeamId, player.id, amount, years, twoWay); });
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
          <input type="range" min={min} max={max} step={10000} value={amount} disabled={twoWay} onChange={(e) => setAmount(Number(e.target.value))} />
        </label>
        <label className={styles.offerField}>
          <span>Years: {years}</span>
          <input type="range" min={1} max={5} step={1} value={years} disabled={twoWay} onChange={(e) => setYears(Number(e.target.value))} />
        </label>
        {eligibleTwoWay && (
          <label className={styles.checkField}>
            <input type="checkbox" checked={twoWay} onChange={(e) => setTwoWay(e.target.checked)} /> Two-way contract
          </label>
        )}
        <div className={check.reason ? styles.legalBad : styles.legalOk}>{check.reason ?? (check.usesMle ? 'Uses Mid-Level Exception' : 'Signing is legal')}</div>
        {error && <div className={styles.legalBad}>{error}</div>}
        <div className={styles.offerModalBtns}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.proposeBtn} disabled={!!check.reason} onClick={submit}>Submit Offer</button>
        </div>
      </div>
    </div>
  );
}

function FreeAgentsTab({ s, mutate }: { s: GameState; mutate: Mutate }) {
  const [sortKey, setSortKey] = useState<FaSortKey>('ovr');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [offerId, setOfferId] = useState<string | null>(null);

  const rows = useMemo<FaRow[]>(() => {
    const withVals = freeAgents(s).map((p) => ({ p, ask: askingPrice(s, p), mv: marketValue(p, s.seasonYear) }));
    const getters: Record<FaSortKey, (r: FaRow) => number | string> = {
      name: (r) => r.p.lastName, pos: (r) => r.p.positions[0] ?? '', age: (r) => ageOf(r.p.birthDate),
      ovr: (r) => r.p.ratings.ovr, pot: (r) => r.p.ratings.pot, ask: (r) => r.ask.amount, mv: (r) => r.mv,
    };
    const fn = getters[sortKey];
    return [...withVals].sort((a, b) => {
      const va = fn(a), vb = fn(b);
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return cmp * sortDir;
    });
  }, [s, sortKey, sortDir]);

  const toggleSort = (k: FaSortKey) => { if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1) as 1 | -1); else { setSortKey(k); setSortDir(k === 'name' || k === 'pos' ? 1 : -1); } };
  const th = (k: FaSortKey, label: string) => (
    <button type="button" className={styles.sortHead} onClick={() => toggleSort(k)}>{label}{sortKey === k && <span className={styles.sortArrow}>{sortDir === 1 ? '▲' : '▼'}</span>}</button>
  );

  const columns: DataTableColumn<FaRow>[] = [
    { key: 'face', header: '', render: (r) => <BkImage path={r.p.face} alt={r.p.lastName} className={styles.faceThumb} /> },
    { key: 'name', header: th('name', 'Name'), render: (r) => `${r.p.firstName} ${r.p.lastName}` },
    { key: 'pos', header: th('pos', 'Pos'), render: (r) => r.p.positions.join('/') },
    { key: 'age', header: th('age', 'Age'), align: 'right', render: (r) => Math.floor(ageOf(r.p.birthDate)) },
    { key: 'ovr', header: th('ovr', 'OVR'), align: 'right', render: (r) => r.p.ratings.ovr },
    { key: 'pot', header: th('pot', 'POT'), align: 'right', render: (r) => r.p.ratings.pot },
    { key: 'ask', header: th('ask', 'Asking'), align: 'right', render: (r) => `${formatMoneyShort(r.ask.amount)} / ${r.ask.years}y` },
    { key: 'mv', header: th('mv', 'Market'), align: 'right', render: (r) => formatMoneyShort(r.mv) },
  ];

  const team = s.teams[s.userTeamId];
  const pay = cbaPayroll(s, s.userTeamId);
  const cap = capNumbers(s.seasonYear);
  const roster = rosterOf(s, s.userTeamId);
  const stdCount = roster.filter((p) => !isTwoWay(p)).length;
  const twCount = roster.filter(isTwoWay).length;
  const offering = rows.find((r) => r.p.id === offerId) ?? null;

  return (
    <div className={styles.faWrap}>
      <div className={styles.faHeader}>
        <span>Payroll {formatMoneyShort(pay)}</span>
        <span>Cap Room {formatMoneyShort(cap.cap - pay)}</span>
        <span>MLE {team.mleUsed ? 'Used' : formatMoneyShort(cap.mle)}</span>
        <span>Roster {stdCount}/15</span>
        <span>Two-Way {twCount}/3</span>
      </div>
      <Panel title="Free Agents" className={styles.faPanel} flush>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.p.id} onRowClick={(r) => setOfferId(r.p.id)} compact />
      </Panel>
      {offering && <OfferModal s={s} mutate={mutate} player={offering.p} ask={offering.ask} onClose={() => setOfferId(null)} />}
    </div>
  );
}

function TransactionsTab({ s }: { s: GameState }) {
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const rows = s.transactions.filter((t) => filter === 'all' || t.teams.includes(s.userTeamId));
  return (
    <div className={styles.txWrap}>
      <div className={styles.subTabs}>
        <button type="button" className={filter === 'all' ? `${styles.subTab} ${styles.subTabActive}` : styles.subTab} onClick={() => setFilter('all')}>All</button>
        <button type="button" className={filter === 'mine' ? `${styles.subTab} ${styles.subTabActive}` : styles.subTab} onClick={() => setFilter('mine')}>My Team</button>
      </div>
      <Panel title="Transactions" className={styles.txPanel} flush>
        <div className={styles.txList}>
          {rows.length === 0 && <div className={styles.empty}>No transactions</div>}
          {rows.map((t, i) => (
            <div key={i} className={styles.txRow}>
              <span className={styles.txDate}>{formatDate(t.date)}</span>
              <span className={styles.txKind}>{t.kind}</span>
              <span className={styles.txText}>{t.text}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export default function TransfersScreen() {
  const s = useGameState();
  const mutate = useGame((g) => g.mutate);
  const [subTab, setSubTab] = useState<SubTab>('trade');
  const jump = useTransfersNav((st) => st.jumpToOffers);

  useEffect(() => {
    if (jump) { setSubTab('offers'); useTransfersNav.getState().clear(); }
  }, [jump]);

  if (!s) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.subTabs}>
        {(['trade', 'offers', 'fa', 'tx'] as SubTab[]).map((t) => (
          <button key={t} type="button" className={t === subTab ? `${styles.subTab} ${styles.subTabActive}` : styles.subTab} onClick={() => setSubTab(t)}>
            {t === 'trade' ? 'Trade Center' : t === 'offers' ? `Offers${s.tradeOffers.length ? ` (${s.tradeOffers.length})` : ''}` : t === 'fa' ? 'Free Agents' : 'Transactions'}
          </button>
        ))}
      </div>
      {subTab === 'trade' && <TradeCenter s={s} mutate={mutate} />}
      {subTab === 'offers' && <OffersTab s={s} mutate={mutate} />}
      {subTab === 'fa' && <FreeAgentsTab s={s} mutate={mutate} />}
      {subTab === 'tx' && <TransactionsTab s={s} />}
    </div>
  );
}
