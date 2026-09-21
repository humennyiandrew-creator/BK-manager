import { useEffect, useMemo, useState } from 'react';
import HeroHeader from '../components/HeroHeader';
import SideRail, { type SideRailItem } from '../components/SideRail';
import Panel from '../components/Panel';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import BkImage from '../components/BkImage';
import TeamBadge from '../components/TeamBadge';
import { IconTransfers, IconMessages, IconRoster, IconFinances } from '../components/tabIcons';
import { useGame, useGameState } from '../store/useGame';
import { useUI } from '../store/useUI';
import { useTransfersNav } from '../store/useTransfersNav';
import { ageOf } from '../../engine/ratings';
import type { DraftPick, GameState, Player, TradeSide } from '../../engine/model';
import { evaluateTrade, playerValue, pickValue, proposeTrade, respondToOffer, tradeLegal, tradeWindowOpen } from '../../engine/trade';
import { askingPrice, freeAgents, releasePlayer } from '../../engine/freeagency';
import { capNumbers, isTwoWay, marketValue, payroll as cbaPayroll, rosterOf, salaryIn, yearsLeft } from '../../engine/cba';
import { buyoutCost } from '../../engine/euro';
import { leagueOf } from '../../engine/leagues';
import {
  type BidResult, askingPriceFor, loanOut, makeBid, respondToBid,
  transferValue, transferWindowOpen, wageRoom
} from '../../engine/transfers-euro';
import { formatDate, formatMoney, formatMoneyShort } from '../format';
import NegotiationModal from '../components/NegotiationModal';
import ConfirmDialog from '../components/ConfirmDialog';
import { toast } from '../components/Toasts';
import styles from './TransfersScreen.module.css';

type SubTab = 'trade' | 'offers' | 'fa' | 'buyout' | 'tx' | 'market' | 'bids' | 'loans';
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
    { key: 'age', header: 'Age', align: 'right', render: (a) => (a.kind === 'player' ? Math.floor(ageOf(a.player.birthDate)) : '-'), sortValue: (a) => (a.kind === 'player' ? ageOf(a.player.birthDate) : 0) },
    { key: 'ovr', header: 'OVR/POT', align: 'right', render: (a) => (a.kind === 'player' ? `${a.player.ratings.ovr}/${a.player.ratings.pot}` : '-'), sortValue: (a) => (a.kind === 'player' ? a.player.ratings.ovr : 0) },
    {
      key: 'sal', header: 'Salary', align: 'right', render: (a) => a.kind === 'player'
        ? (a.player.contract ? `${formatMoneyShort(salaryIn(a.player, s.season))} · ${yearsLeft(a.player, s.season)}y` : '-')
        : '-',
      sortValue: (a) => (a.kind === 'player' ? salaryIn(a.player, s.season) : 0)
    },
  ];
  const openPlayer = useUI((u) => u.openPlayer);
  return (
    <DataTable
      columns={columns}
      rows={assets}
      rowKey={(a) => a.id}
      onRowClick={onToggle}
      onRowOpen={(a) => { if (a.kind === 'player') openPlayer(a.id); }}
      rowClass={(a) => (isSelected(a) ? styles.assetSelected : undefined)}
      compact
    />
  );
}

function TradeCenter({ s, mutate }: { s: GameState; mutate: Mutate }) {
  const userLeague = s.teams[s.userTeamId].league ?? 'NBA';
  const aiTeams = useMemo(
    () => Object.values(s.teams).filter((t) => t.id !== s.userTeamId && (t.league ?? 'NBA') === userLeague).sort((a, b) => a.city.localeCompare(b.city)),
    [s.teams, s.userTeamId, userLeague]
  );
  const [aiTeamId, setAiTeamId] = useState(aiTeams[0]?.id ?? '');
  const [youSend, setYouSend] = useState<TradeSide>({ players: [], picks: [] });
  const [theySend, setTheySend] = useState<TradeSide>({ players: [], picks: [] });
  const [dealMsg, setDealMsg] = useState<string | null>(null);

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
      setDealMsg(result.text);
      if (result.ok) {
        setYouSend({ players: [], picks: [] }); setTheySend({ players: [], picks: [] });
        toast(result.text, 'success');
      }
      setTimeout(() => setDealMsg(null), 3500);
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
          {dealMsg && <div className={styles.toast}>{dealMsg}</div>}
        </Panel>
        <Panel title="You Receive" className={styles.tradeCol} flush>
          <AssetTable s={s} teamId={aiTeamId} selected={theySend} onToggle={(a) => setTheySend((side) => toggleAsset(side, a))} />
        </Panel>
      </div>
    </div>
  );
}

function OffersTab({ s, mutate }: { s: GameState; mutate: Mutate }) {
  const [msg, setMsg] = useState<string | null>(null);
  const respond = (id: number, accept: boolean) => {
    let result: string | undefined;
    mutate((st) => { result = respondToOffer(st, id, accept); });
    if (result) {
      setMsg(result);
      if (accept) toast(result, 'success');
      setTimeout(() => setMsg(null), 3000);
    }
  };
  return (
    <Panel title="Incoming Offers" className={styles.offersPanel} flush>
      {msg && <div className={styles.toast}>{msg}</div>}
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

function FreeAgentsTab({ s, mutate }: { s: GameState; mutate: Mutate }) {
  const openPlayer = useUI((u) => u.openPlayer);
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
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.p.id} onRowClick={(r) => setOfferId(r.p.id)} onRowOpen={(r) => openPlayer(r.p.id)} compact />
      </Panel>
      {offering && <NegotiationModal s={s} mutate={mutate} playerId={offering.p.id} kind="fa" onClose={() => setOfferId(null)} />}
    </div>
  );
}

function BuyoutTargetsPanel({ s, mutate }: { s: GameState; mutate: Mutate }) {
  const openPlayer = useUI((u) => u.openPlayer);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [offerId, setOfferId] = useState<string | null>(null);
  const userLeague = s.teams[s.userTeamId].league ?? 'NBA';

  const targets = useMemo(
    () => Object.values(s.players)
      .filter((p) => p.teamId && !p.retired && !p.prospect && (s.teams[p.teamId!]?.league ?? 'NBA') !== userLeague)
      .sort((a, b) => b.ratings.ovr - a.ratings.ovr)
      .slice(0, 25),
    [s.players, s.teams, userLeague]
  );

  const target = targetId ? s.players[targetId] : null;
  const cost = target ? buyoutCost(s, target) : 0;
  const canAfford = target ? s.finance.cash >= cost : false;

  const columns: DataTableColumn<Player>[] = [
    { key: 'face', header: '', render: (p) => <BkImage path={p.face} alt={p.lastName} className={styles.faceThumb} /> },
    { key: 'name', header: 'Name', render: (p) => `${p.firstName} ${p.lastName}` },
    { key: 'club', header: 'Club', render: (p) => <TeamBadge logoPath={s.teams[p.teamId!]?.logo ?? null} name={s.teams[p.teamId!]?.abbr ?? '?'} /> },
    { key: 'pos', header: 'Pos', render: (p) => p.positions.join('/') },
    { key: 'age', header: 'Age', align: 'right', render: (p) => Math.floor(ageOf(p.birthDate)), sortValue: (p) => ageOf(p.birthDate) },
    { key: 'ovr', header: 'OVR', align: 'right', render: (p) => p.ratings.ovr, sortValue: (p) => p.ratings.ovr },
    { key: 'buyout', header: 'Buyout', align: 'right', render: (p) => formatMoneyShort(buyoutCost(s, p)), sortValue: (p) => buyoutCost(s, p) },
    {
      key: 'action', header: '', align: 'right', render: (p) => (
        <button type="button" className={styles.offerBtn} onClick={(e) => { e.stopPropagation(); setTargetId(p.id); }}>Buyout</button>
      )
    }
  ];

  const doBuyout = () => {
    if (!target || !canAfford) { setTargetId(null); return; }
    const pid = target.id;
    mutate((st) => {
      st.finance.cash -= cost;
      releasePlayer(st, pid);
    });
    setTargetId(null);
    setOfferId(pid);
  };

  return (
    <div className={styles.faWrap}>
      <Panel title="International Buyout Targets" className={styles.faPanel} flush>
        {targets.length === 0 && <div className={styles.empty}>No contracted players from other leagues.</div>}
        {targets.length > 0 && <DataTable columns={columns} rows={targets} rowKey={(p) => p.id} onRowOpen={(p) => openPlayer(p.id)} compact />}
      </Panel>
      {target && (
        <ConfirmDialog
          title={`Buy out ${target.firstName} ${target.lastName}?`}
          message={canAfford
            ? `Pay ${formatMoney(cost)} to release him from ${s.teams[target.teamId!]?.name}, then negotiate terms to sign him.`
            : `Buyout costs ${formatMoney(cost)} — not enough cash on hand (${formatMoney(s.finance.cash)}).`}
          confirmLabel="Pay Buyout"
          danger={!canAfford}
          onCancel={() => setTargetId(null)}
          onConfirm={doBuyout}
        />
      )}
      {offerId && <NegotiationModal s={s} mutate={mutate} playerId={offerId} kind="fa" onClose={() => setOfferId(null)} />}
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

// ---------- european market ----------

function EuroHeaderStrip({ s }: { s: GameState }) {
  const league = leagueOf(s.teams[s.userTeamId].league);
  const squad = rosterOf(s, s.userTeamId).length;
  const open = transferWindowOpen(s);
  const md = s.date.slice(5);
  const windowLabel = !open
    ? 'Window shut'
    : md >= '01-01' && md <= '02-15'
    ? 'Winter window open — closes 15 Feb'
    : 'Summer window open — closes 30 Sep';
  return (
    <div className={styles.euroHeader}>
      <span>Cash {formatMoneyShort(s.finance.cash)}</span>
      <span>Wage Room {formatMoneyShort(wageRoom(s, s.userTeamId))}</span>
      <span>Squad {squad}/{league.maxRoster}</span>
      <span className={open ? styles.windowOpen : styles.windowShut}>{windowLabel}</span>
    </div>
  );
}

function BidModal({ s, mutate, playerId, onClose }: { s: GameState; mutate: Mutate; playerId: string; onClose: () => void }) {
  const p = s.players[playerId];
  const ask = askingPriceFor(s, p);
  const curWage = salaryIn(p, s.season);
  const room = wageRoom(s, s.userTeamId);
  const [fee, setFee] = useState(Math.round(ask / 50_000) * 50_000);
  const [wage, setWage] = useState(Math.max(curWage, 100_000));
  const [years, setYears] = useState(3);
  const [result, setResult] = useState<string | null>(null);

  const cash = s.finance?.cash ?? 0;
  const cashOk = fee <= cash;
  const wageOk = wage <= room;
  const feeMax = Math.max(50_000, Math.round((ask * 2) / 50_000) * 50_000);
  const wageMax = Math.max(room, wage, curWage, 1_000_000);

  const submit = () => {
    let r: BidResult | undefined;
    mutate((st) => { r = makeBid(st, playerId, fee, wage, years); });
    if (r) { setResult(r.text); if (r.ok) toast(r.text, 'success'); }
  };

  return (
    <div className={`${styles.backdrop} fade-in`} onClick={onClose}>
      <div className={styles.offerModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.offerModalHead}>
          <BkImage path={p.face} alt={p.lastName} className={styles.offerModalFace} />
          <div>
            <div className={styles.offerModalName}>{p.firstName} {p.lastName}</div>
            <div className={styles.offerModalMeta}>{s.teams[p.teamId!]?.name} · Asking {formatMoneyShort(ask)}</div>
          </div>
        </div>
        <label className={styles.offerField}>
          <span>Fee: {formatMoney(fee)}</span>
          <input type="range" min={0} max={feeMax} step={50_000} value={fee} onChange={(e) => setFee(Number(e.target.value))} />
        </label>
        <label className={styles.offerField}>
          <span>Wage: {formatMoney(wage)}/yr</span>
          <input type="range" min={100_000} max={wageMax} step={10_000} value={wage} onChange={(e) => setWage(Number(e.target.value))} />
        </label>
        <label className={styles.offerField}>
          <span>Years: {years}</span>
          <input type="range" min={1} max={5} step={1} value={years} onChange={(e) => setYears(Number(e.target.value))} />
        </label>
        <div className={cashOk ? styles.legalOk : styles.legalBad}>{cashOk ? `Cash OK (${formatMoneyShort(cash)} available)` : `Not enough cash (${formatMoneyShort(cash)} available)`}</div>
        <div className={wageOk ? styles.legalOk : styles.legalBad}>{wageOk ? `Wage room OK (${formatMoneyShort(room)} left)` : `Exceeds wage room (${formatMoneyShort(room)} left)`}</div>
        {result && <div className={styles.toast}>{result}</div>}
        <div className={styles.offerModalBtns}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>Close</button>
          <button type="button" className={styles.proposeBtn} disabled={!cashOk || !wageOk} onClick={submit}>Submit Bid</button>
        </div>
      </div>
    </div>
  );
}

function MarketTab({ s, mutate }: { s: GameState; mutate: Mutate }) {
  const openPlayer = useUI((u) => u.openPlayer);
  const [query, setQuery] = useState('');
  const [bidId, setBidId] = useState<string | null>(null);
  const userLeague = s.teams[s.userTeamId].league ?? 'NBA';

  const rows = useMemo(
    () => Object.values(s.players)
      .filter((p) => p.teamId && p.teamId !== s.userTeamId && !p.retired && !p.prospect && (s.teams[p.teamId]?.league ?? 'NBA') === userLeague)
      .filter((p) => !query || `${p.firstName} ${p.lastName}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => b.ratings.ovr - a.ratings.ovr),
    [s.players, s.teams, userLeague, query]
  );

  const columns: DataTableColumn<Player>[] = [
    { key: 'face', header: '', render: (p) => <BkImage path={p.face} alt={p.lastName} className={styles.faceThumb} /> },
    { key: 'name', header: 'Name', render: (p) => `${p.firstName} ${p.lastName}` },
    { key: 'club', header: 'Club', render: (p) => <TeamBadge logoPath={s.teams[p.teamId!]?.logo ?? null} name={s.teams[p.teamId!]?.abbr ?? '?'} /> },
    { key: 'age', header: 'Age', align: 'right', render: (p) => Math.floor(ageOf(p.birthDate)), sortValue: (p) => ageOf(p.birthDate) },
    { key: 'ovr', header: 'OVR', align: 'right', render: (p) => p.ratings.ovr, sortValue: (p) => p.ratings.ovr },
    { key: 'wage', header: 'Wage', align: 'right', render: (p) => formatMoneyShort(salaryIn(p, s.season)), sortValue: (p) => salaryIn(p, s.season) },
    { key: 'yrs', header: 'Yrs Left', align: 'right', render: (p) => yearsLeft(p, s.season), sortValue: (p) => yearsLeft(p, s.season) },
    { key: 'val', header: 'Your Value', align: 'right', render: (p) => formatMoneyShort(transferValue(s, p)), sortValue: (p) => transferValue(s, p) },
    { key: 'ask', header: 'Asking', align: 'right', render: (p) => formatMoneyShort(askingPriceFor(s, p)), sortValue: (p) => askingPriceFor(s, p) },
    { key: 'action', header: '', align: 'right', render: (p) => <button type="button" className={styles.offerBtn} onClick={(e) => { e.stopPropagation(); setBidId(p.id); }}>Bid</button> }
  ];

  return (
    <div className={styles.faWrap}>
      <div className={styles.searchRow}>
        <input className={styles.searchInput} placeholder="Search players…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <Panel title="Market" className={styles.faPanel} flush>
        {rows.length === 0 && <div className={styles.empty}>No players found at other clubs.</div>}
        {rows.length > 0 && <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} onRowOpen={(p) => openPlayer(p.id)} compact />}
      </Panel>
      {bidId && <BidModal s={s} mutate={mutate} playerId={bidId} onClose={() => setBidId(null)} />}
    </div>
  );
}

function IncomingBidsTab({ s, mutate }: { s: GameState; mutate: Mutate }) {
  const [msg, setMsg] = useState<string | null>(null);
  const bids = s.bids.filter((b) => b.fromTeam === s.userTeamId && b.status === 'pending');

  const respond = (id: number, accept: boolean) => {
    let r: BidResult | undefined;
    mutate((st) => { r = respondToBid(st, id, accept); });
    if (r) {
      setMsg(r.text);
      if (accept) toast(r.text, 'success');
      setTimeout(() => setMsg(null), 3000);
    }
  };

  return (
    <Panel title="Incoming Bids" className={styles.offersPanel} flush>
      {msg && <div className={styles.toast}>{msg}</div>}
      {bids.length === 0 && <div className={styles.empty}>No incoming bids</div>}
      <div className={styles.offerList}>
        {bids.map((b) => {
          const p = s.players[b.playerId];
          if (!p) return null;
          const val = askingPriceFor(s, p);
          return (
            <div key={b.id} className={styles.offerCard}>
              <TeamBadge logoPath={s.teams[b.toTeam]?.logo ?? null} name={s.teams[b.toTeam]?.name ?? ''} className={styles.offerTeam} />
              <div className={styles.offerBody}>
                <div><span className={styles.offerLabel}>Player</span> {p.firstName} {p.lastName}</div>
                <div><span className={styles.offerLabel}>Fee</span> {formatMoneyShort(b.fee)} <span className={styles.offerValue}>(your valuation {formatMoneyShort(val)})</span></div>
                <div className={styles.offerExpiry}>Expires {formatDate(b.expires)}</div>
              </div>
              <div className={styles.offerBtns}>
                <button type="button" className={styles.acceptBtn} onClick={() => respond(b.id, true)}>Accept</button>
                <button type="button" className={styles.declineBtn} onClick={() => respond(b.id, false)}>Reject</button>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function LoansTab({ s, mutate }: { s: GameState; mutate: Mutate }) {
  const openPlayer = useUI((u) => u.openPlayer);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [clubId, setClubId] = useState('');
  const userLeague = s.teams[s.userTeamId].league ?? 'NBA';

  const eligible = useMemo(
    () => rosterOf(s, s.userTeamId).filter((p) => ageOf(p.birthDate) <= 24).sort((a, b) => b.ratings.ovr - a.ratings.ovr),
    [s.players, s.teams, s.userTeamId]
  );
  const clubs = useMemo(
    () => Object.values(s.teams).filter((t) => t.id !== s.userTeamId && (t.league ?? 'NBA') === userLeague).sort((a, b) => a.name.localeCompare(b.name)),
    [s.teams, userLeague]
  );

  const columns: DataTableColumn<Player>[] = [
    { key: 'face', header: '', render: (p) => <BkImage path={p.face} alt={p.lastName} className={styles.faceThumb} /> },
    { key: 'name', header: 'Name', render: (p) => `${p.firstName} ${p.lastName}` },
    { key: 'pos', header: 'Pos', render: (p) => p.positions.join('/') },
    { key: 'age', header: 'Age', align: 'right', render: (p) => Math.floor(ageOf(p.birthDate)), sortValue: (p) => ageOf(p.birthDate) },
    { key: 'ovr', header: 'OVR/POT', align: 'right', render: (p) => `${p.ratings.ovr}/${p.ratings.pot}`, sortValue: (p) => p.ratings.ovr },
    {
      key: 'action', header: '', align: 'right', render: (p) => (
        <button type="button" className={styles.offerBtn} onClick={(e) => { e.stopPropagation(); setTargetId(p.id); setClubId(clubs[0]?.id ?? ''); }}>Loan Out</button>
      )
    }
  ];

  const target = targetId ? s.players[targetId] : null;
  const doLoan = () => {
    if (!target || !clubId) { setTargetId(null); return; }
    let r: BidResult | undefined;
    mutate((st) => { r = loanOut(st, target.id, clubId); });
    if (r) toast(r.text, r.ok ? 'success' : 'error');
    setTargetId(null);
  };

  return (
    <div className={styles.faWrap}>
      <Panel title="Loan Listed (24 & Under)" className={styles.faPanel} flush>
        {eligible.length === 0 && <div className={styles.empty}>No eligible players (24 and under).</div>}
        {eligible.length > 0 && <DataTable columns={columns} rows={eligible} rowKey={(p) => p.id} onRowOpen={(p) => openPlayer(p.id)} compact />}
      </Panel>
      {target && (
        <div className={`${styles.backdrop} fade-in`} onClick={() => setTargetId(null)}>
          <div className={styles.offerModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.offerModalHead}>
              <BkImage path={target.face} alt={target.lastName} className={styles.offerModalFace} />
              <div>
                <div className={styles.offerModalName}>{target.firstName} {target.lastName}</div>
                <div className={styles.offerModalMeta}>Loan to another club for the season</div>
              </div>
            </div>
            <label className={styles.offerField}>
              <span>Club</span>
              <select className={styles.select} value={clubId} onChange={(e) => setClubId(e.target.value)}>
                {clubs.map((t) => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
              </select>
            </label>
            <div className={styles.offerModalBtns}>
              <button type="button" className={styles.cancelBtn} onClick={() => setTargetId(null)}>Cancel</button>
              <button type="button" className={styles.proposeBtn} disabled={!clubId} onClick={doLoan}>Confirm Loan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TransfersScreen() {
  const s = useGameState();
  const mutate = useGame((g) => g.mutate);
  const isEuroClub = (s?.teams[s.userTeamId]?.league ?? 'NBA') !== 'NBA';
  const [subTab, setSubTab] = useState<SubTab>(isEuroClub ? 'market' : 'trade');
  const jump = useTransfersNav((st) => st.jumpTo);

  useEffect(() => {
    if (jump) { setSubTab(jump); useTransfersNav.getState().clear(); }
  }, [jump]);

  if (!s) return null;

  const railItems: SideRailItem<SubTab>[] = isEuroClub
    ? [
        { id: 'market', label: 'Market', icon: IconTransfers },
        { id: 'bids', label: 'Incoming Bids', icon: IconMessages, badge: s.bids.filter((b) => b.fromTeam === s.userTeamId && b.status === 'pending').length },
        { id: 'loans', label: 'Loans', icon: IconRoster },
        { id: 'fa', label: 'Free Agents', icon: IconRoster },
        { id: 'tx', label: 'Transactions', icon: IconFinances }
      ]
    : [
        { id: 'trade', label: 'Trade Center', icon: IconTransfers },
        { id: 'offers', label: 'Offers', icon: IconMessages, badge: s.tradeOffers.length },
        { id: 'fa', label: 'Free Agents', icon: IconRoster },
        { id: 'buyout', label: 'Buyout Targets', icon: IconTransfers },
        { id: 'tx', label: 'Transactions', icon: IconFinances }
      ];

  return (
    <div className={styles.screen}>
      <HeroHeader title="Transfers" subtitle={isEuroClub ? 'European transfer market' : 'Trade and free agency'} />
      {isEuroClub && <EuroHeaderStrip s={s} />}
      <div className={styles.body}>
        <SideRail items={railItems} active={subTab} onSelect={setSubTab} />
        <div className={styles.content}>
          {!isEuroClub && subTab === 'trade' && <TradeCenter s={s} mutate={mutate} />}
          {!isEuroClub && subTab === 'offers' && <OffersTab s={s} mutate={mutate} />}
          {!isEuroClub && subTab === 'buyout' && <BuyoutTargetsPanel s={s} mutate={mutate} />}
          {isEuroClub && subTab === 'market' && <MarketTab s={s} mutate={mutate} />}
          {isEuroClub && subTab === 'bids' && <IncomingBidsTab s={s} mutate={mutate} />}
          {isEuroClub && subTab === 'loans' && <LoansTab s={s} mutate={mutate} />}
          {subTab === 'fa' && <FreeAgentsTab s={s} mutate={mutate} />}
          {subTab === 'tx' && <TransactionsTab s={s} />}
        </div>
      </div>
    </div>
  );
}
