import { useMemo, useState } from 'react';
import Panel from '../components/Panel';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import BkImage from '../components/BkImage';
import TeamBadge from '../components/TeamBadge';
import ProgressBar from '../components/ProgressBar';
import { useGame, useGameState } from '../store/useGame';
import { ageOf, type Attr } from '../../engine/ratings';
import type { GameState, Player } from '../../engine/model';
import { aiPick, draftUntilUser, makePick, nextPick, runLottery, scoutView } from '../../engine/draft';
import { standings } from '../../engine/season';
import { hashString, mulberry32 } from '../../engine/rng';
import { ATTR_GROUPS, ATTR_LABEL, attrVariant } from '../attrGroups';
import { formatDate, heightFtIn } from '../format';
import styles from './DraftScreen.module.css';

interface Scouted { p: Player; ovr: number; pot: number; range: number }

function scoutAttr(s: GameState, pid: string, teamId: string, attr: Attr, range: number): number {
  const rng = mulberry32(hashString(`${s.seed}|scoutattr|${teamId}|${pid}|${attr}`));
  const noise = (rng() - 0.5) * 2 * range;
  const p = s.players[pid];
  return Math.max(25, Math.min(99, Math.round(p.ratings.attrs[attr] + noise)));
}

function ProspectDetail({ s, scouted }: { s: GameState; scouted: Scouted }) {
  const { p, ovr, pot, range } = scouted;
  const age = Math.floor(ageOf(p.birthDate, new Date(s.date)));
  return (
    <div className={styles.detail}>
      <div className={styles.detailHead}>
        <BkImage path={p.face} alt={p.lastName} className={styles.detailFace} />
        <div>
          <div className={styles.detailName}>{p.firstName} {p.lastName}</div>
          <div className={styles.detailMeta}>{p.positions.join('/')} · {age}y · {heightFtIn(p.heightCm)} · {p.weightKg}kg · {p.country}</div>
          <div className={styles.detailMeta}>{p.college ?? 'International'} · Scouted OVR {ovr}±{range} · POT {pot}±{range}</div>
        </div>
      </div>
      <div className={styles.attrGrid}>
        {ATTR_GROUPS.map((g) => (
          <div key={g.label} className={styles.attrGroup}>
            <div className={styles.sectionTitle}>{g.label}</div>
            {g.attrs.map((a) => {
              const v = scoutAttr(s, p.id, s.userTeamId, a, range);
              return (
                <div key={a} className={styles.attrRow}>
                  <span className={styles.attrLabel}>{ATTR_LABEL[a]}</span>
                  <ProgressBar value={v} variant={attrVariant(v)} className={styles.attrBar} />
                  <span className={styles.attrValue}>{v}±{range}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function DraftOrderPanel({ s }: { s: GameState }) {
  const madeMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of s.transactions) {
      if (t.kind !== 'draft') continue;
      const m = t.text.match(/^Pick (\d+): (\w+) select (.+?) \(/);
      if (m) map.set(Number(m[1]), `${m[2]} — ${m[3]}`);
    }
    return map;
  }, [s.transactions]);

  if (s.draftOrder.length === 0) {
    const order = standings(s).slice().reverse();
    return (
      <Panel title="Projected Order (reverse standings)" className={styles.orderPanel} flush>
        <div className={styles.orderList}>
          {order.map((r, i) => (
            <div key={r.teamId} className={styles.orderRow}>
              <span className={styles.orderSlot}>{i + 1}</span>
              <TeamBadge logoPath={s.teams[r.teamId].logo} name={`${s.teams[r.teamId].abbr} (${r.w}-${r.l})`} className={styles.orderTeam} />
            </div>
          ))}
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Draft Order" className={styles.orderPanel} flush>
      <div className={styles.orderList}>
        {s.draftOrder.map((id, i) => {
          const slot = i + 1;
          const pick = s.picks.find((p) => p.id === id);
          const made = madeMap.get(slot);
          const round = pick?.round ?? Number(id.split('-')[1]);
          const roundStart = i === 0 || Number(s.draftOrder[i - 1].split('-')[1]) !== round;
          return (
            <div key={id}>
              {roundStart && <div className={styles.orderRound}>Round {round}</div>}
              <div className={made ? `${styles.orderRow} ${styles.orderRowDone}` : styles.orderRow}>
                <span className={styles.orderSlot}>{slot}</span>
                {pick ? (
                  <TeamBadge logoPath={s.teams[pick.owner]?.logo ?? null} name={s.teams[pick.owner]?.abbr ?? '?'} className={styles.orderTeam} />
                ) : (
                  <span className={styles.orderMade}>{made ?? id}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export default function DraftScreen() {
  const s = useGameState();
  const mutate = useGame((g) => g.mutate);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const scoutedList = useMemo<Scouted[]>(() => {
    if (!s) return [];
    return s.draftClass
      .map((id) => { const v = scoutView(s, id, s.userTeamId); return { p: s.players[id], ovr: v.ovr, pot: v.pot, range: v.range }; })
      .sort((a, b) => b.pot - a.pot);
  }, [s]);

  if (!s) return null;

  const selected = scoutedList.find((x) => x.p.id === selectedId) ?? scoutedList[0] ?? null;
  const yourPicks = s.picks.filter((p) => p.owner === s.userTeamId && p.year === s.seasonYear + 1).sort((a, b) => a.round - b.round);
  const pending = nextPick(s);
  const liveMode = s.draftOrder.length > 0 && !!pending;
  const isUserTurn = liveMode && pending?.owner === s.userTeamId;
  const recentPicks = s.transactions.filter((t) => t.kind === 'draft').slice(0, 8);

  const columns: DataTableColumn<Scouted>[] = [
    { key: 'face', header: '', render: (r) => <BkImage path={r.p.face} alt={r.p.lastName} className={styles.faceThumb} /> },
    { key: 'name', header: 'Name', render: (r) => `${r.p.firstName} ${r.p.lastName}` },
    { key: 'pos', header: 'Pos', render: (r) => r.p.positions.join('/') },
    { key: 'age', header: 'Age', align: 'right', render: (r) => Math.floor(ageOf(r.p.birthDate, new Date(s.date))) },
    { key: 'ht', header: 'Ht', align: 'right', render: (r) => heightFtIn(r.p.heightCm) },
    { key: 'college', header: 'College/Club', render: (r) => r.p.college ?? '-' },
    { key: 'country', header: 'Country', render: (r) => r.p.country },
    { key: 'ovr', header: 'Scout OVR', align: 'right', render: (r) => `${r.ovr}±${r.range}` },
    { key: 'pot', header: 'Scout POT', align: 'right', render: (r) => `${r.pot}±${r.range}` },
  ];

  const simToPick = () => mutate((st) => { draftUntilUser(st); });
  const draftSelected = () => {
    if (!selected) return;
    mutate((st) => { const p = nextPick(st); if (p) makePick(st, p.id, selected.p.id); });
    setSelectedId(null);
  };
  const autoPick = () => mutate((st) => { const p = nextPick(st); if (p) aiPick(st, p.id); });
  const runLotteryTest = () => mutate((st) => { runLottery(st); });

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div className={styles.headerBlock}>
          <span className={styles.headerLabel}>Draft Date</span>
          <span className={styles.headerValue}>{formatDate(s.keyDates.draft)}</span>
        </div>
        <div className={styles.headerBlock}>
          <span className={styles.headerLabel}>Your Picks ({s.seasonYear + 1})</span>
          <span className={styles.headerValue}>
            {yourPicks.length ? yourPicks.map((p) => `R${p.round}`).join(', ') : 'None'}
          </span>
        </div>
        {import.meta.env.DEV && s.draftOrder.length === 0 && (
          <button type="button" className={styles.devBtn} onClick={runLotteryTest}>Run lottery (test)</button>
        )}
      </div>

      <div className={styles.grid}>
        <Panel title="Big Board" className={styles.boardPanel} flush>
          <DataTable columns={columns} rows={scoutedList} rowKey={(r) => r.p.id} highlightedRowKey={selected?.p.id} onRowClick={(r) => setSelectedId(r.p.id)} compact />
        </Panel>

        <Panel title="Prospect" className={styles.detailPanel}>
          {selected ? <ProspectDetail s={s} scouted={selected} /> : <div className={styles.empty}>No prospects</div>}
        </Panel>

        <div className={styles.rightCol}>
          <DraftOrderPanel s={s} />
          {liveMode && (
            <Panel title="Live Draft" className={styles.livePanel}>
              <div className={styles.liveStatus}>
                On the clock: <TeamBadge logoPath={s.teams[pending!.owner]?.logo ?? null} name={s.teams[pending!.owner]?.abbr ?? '?'} className={styles.liveTeam} /> (R{pending!.round})
              </div>
              <div className={styles.liveBtns}>
                {!isUserTurn && <button type="button" className={styles.simBtn} onClick={simToPick}>Sim to my pick</button>}
                {isUserTurn && (
                  <>
                    <button type="button" className={styles.draftBtn} disabled={!selected} onClick={draftSelected}>Draft {selected ? `${selected.p.firstName} ${selected.p.lastName}` : 'selected player'}</button>
                    <button type="button" className={styles.autoBtn} onClick={autoPick}>Auto-pick</button>
                  </>
                )}
              </div>
              <div className={styles.sectionTitle}>Recent Picks</div>
              <div className={styles.feed}>
                {recentPicks.length === 0 && <div className={styles.empty}>No picks yet</div>}
                {recentPicks.map((t, i) => <div key={i} className={styles.feedRow}>{t.text}</div>)}
              </div>
            </Panel>
          )}
          {!liveMode && s.draftOrder.length > 0 && (
            <Panel title="Draft Complete" className={styles.livePanel}>
              <div className={styles.sectionTitle}>Recent Picks</div>
              <div className={styles.feed}>
                {recentPicks.map((t, i) => <div key={i} className={styles.feedRow}>{t.text}</div>)}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
