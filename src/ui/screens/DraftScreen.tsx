import { useMemo, useState } from 'react';
import HeroHeader from '../components/HeroHeader';
import Panel from '../components/Panel';
import SectionCard from '../components/SectionCard';
import StatTile from '../components/StatTile';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import BkImage from '../components/BkImage';
import TeamBadge from '../components/TeamBadge';
import ProgressBar from '../components/ProgressBar';
import ScoutingTab from '../components/ScoutingTab';
import { IconDraft } from '../components/tabIcons';
import { useGame, useGameState } from '../store/useGame';
import { ageOf } from '../../engine/ratings';
import type { GameState, Player } from '../../engine/model';
import { aiPick, draftUntilUser, makePick, nextPick, runLottery, scoutView } from '../../engine/draft';
import { addToShortlist, removeFromShortlist } from '../../engine/scouting';
import { standings } from '../../engine/season';
import { ATTR_GROUPS, ATTR_LABEL, attrVariant, scoutAttrValue } from '../attrGroups';
import { heightFtIn } from '../format';
import { play } from '../sound';
import { useUI } from '../store/useUI';
import styles from './DraftScreen.module.css';

type SubTab = 'board' | 'scouting';
interface Scouted { p: Player; ovr: number; pot: number; range: number }

const scoutAttr = scoutAttrValue;

function ProspectDetail({ s, scouted }: { s: GameState; scouted: Scouted }) {
  const { p, ovr, pot, range } = scouted;
  const age = Math.floor(ageOf(p.birthDate, new Date(s.date)));
  return (
    <div className={styles.detail}>
      <div className={`${styles.detailHead} diagonal-accent`}>
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
  const openPlayer = useUI((u) => u.openPlayer);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickReveal, setPickReveal] = useState<Scouted | null>(null);
  const [subTab, setSubTab] = useState<SubTab>('board');

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
  const daysToDraft = Math.max(0, Math.ceil((new Date(s.keyDates.draft).getTime() - new Date(s.date).getTime()) / 86400000));

  const toggleShortlist = (pid: string) => mutate((st) => {
    st.scouting.shortlist.includes(pid) ? removeFromShortlist(st, pid) : addToShortlist(st, pid);
  });

  const columns: DataTableColumn<Scouted>[] = [
    { key: 'face', header: '', render: (r) => <BkImage path={r.p.face} alt={r.p.lastName} className={styles.faceThumb} /> },
    {
      key: 'star', header: '', render: (r) => {
        const on = s.scouting.shortlist.includes(r.p.id);
        return <button type="button" className={on ? styles.starActive : styles.starBtn} onClick={(e) => { e.stopPropagation(); toggleShortlist(r.p.id); }}>{on ? '★' : '☆'}</button>;
      }
    },
    { key: 'name', header: 'Name', render: (r) => `${r.p.firstName} ${r.p.lastName}` },
    { key: 'pos', header: 'Pos', render: (r) => r.p.positions.join('/') },
    { key: 'age', header: 'Age', align: 'right', render: (r) => Math.floor(ageOf(r.p.birthDate, new Date(s.date))), sortValue: (r) => Math.floor(ageOf(r.p.birthDate, new Date(s.date))) },
    { key: 'ht', header: 'Ht', align: 'right', render: (r) => heightFtIn(r.p.heightCm), sortValue: (r) => r.p.heightCm },
    { key: 'college', header: 'College/Club', render: (r) => r.p.college ?? '-' },
    { key: 'country', header: 'Country', render: (r) => r.p.country },
    { key: 'ovr', header: 'Scout OVR', align: 'right', render: (r) => `${r.ovr}±${r.range}`, sortValue: (r) => r.ovr },
    {
      key: 'pot', header: 'Scout POT', align: 'right', render: (r) => {
        const k = s.scouting.knowledge[r.p.id] ?? 0;
        return <span>{k > 0 && <span className={styles.eyeIcon} title={`Scouted ${Math.round(k * 100)}%`}>&#128065;</span>}{r.pot}±{r.range}</span>;
      },
      sortValue: (r) => r.pot
    },
  ];

  const simToPick = () => mutate((st) => { draftUntilUser(st); });
  const draftSelected = () => {
    if (!selected) return;
    mutate((st) => { const p = nextPick(st); if (p) makePick(st, p.id, selected.p.id); });
    play('confirm');
    setPickReveal(selected);
    setTimeout(() => setPickReveal(null), 2000);
    setSelectedId(null);
  };
  const autoPick = () => mutate((st) => { const p = nextPick(st); if (p) aiPick(st, p.id); });
  const runLotteryTest = () => mutate((st) => { runLottery(st); });

  const onTheClock = s.offseason?.stage === 'draft' && pending?.owner === s.userTeamId;

  return (
    <div className={styles.screen}>
      <HeroHeader title="Draft" subtitle="Prospect scouting" />
      <div className={styles.subTabs}>
        <button type="button" className={subTab === 'board' ? `${styles.subTab} ${styles.subTabActive}` : styles.subTab} onClick={() => setSubTab('board')}>Big Board</button>
        <button type="button" className={subTab === 'scouting' ? `${styles.subTab} ${styles.subTabActive}` : styles.subTab} onClick={() => setSubTab('scouting')}>Scouting</button>
      </div>
      <div className={styles.body}>
        {subTab === 'scouting' && <ScoutingTab s={s} mutate={mutate} />}
        {subTab === 'board' && (
          <div className={styles.boardBody}>
            {onTheClock && (
              <div className={styles.clockBanner}>
                <span className={styles.clockText}>You&rsquo;re on the clock — Pick #{s.draftOrder.indexOf(pending!.id) + 1}</span>
                <button type="button" className={styles.clockDraftBtn} disabled={!selected} onClick={draftSelected}>
                  Draft selected player{selected ? `: ${selected.p.firstName} ${selected.p.lastName}` : ''}
                </button>
              </div>
            )}
            <div className={styles.statsRow}>
              <StatTile label="Draft In" value={daysToDraft} formatter={(v) => (v <= 0 ? 'Today' : `${v}d`)} className={styles.statTile} />
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
                <DataTable columns={columns} rows={scoutedList} rowKey={(r) => r.p.id} highlightedRowKey={selected?.p.id} onRowClick={(r) => setSelectedId(r.p.id)} onRowOpen={(r) => openPlayer(r.p.id)} compact />
              </Panel>

              <SectionCard title="Prospect" icon={IconDraft} accent glow className={styles.detailPanel}>
                {selected ? <ProspectDetail s={s} scouted={selected} /> : <div className={styles.empty}>No prospects</div>}
              </SectionCard>

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
            {pickReveal && (
              <div className={`${styles.pickReveal} slide-in-right`}>
                <BkImage path={pickReveal.p.face} alt={pickReveal.p.lastName} className={styles.pickRevealFace} />
                <div>
                  <div className={styles.pickRevealLabel}>Pick is in</div>
                  <div className={styles.pickRevealName}>{pickReveal.p.firstName} {pickReveal.p.lastName}</div>
                  <div className={styles.pickRevealMeta}>{pickReveal.p.positions.join('/')} · {pickReveal.p.college ?? 'International'}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
