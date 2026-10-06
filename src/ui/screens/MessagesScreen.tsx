import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import HeroHeader from '../components/HeroHeader';
import SideRail, { type SideRailItem } from '../components/SideRail';
import Panel from '../components/Panel';
import { toast } from '../components/Toasts';
import { useGame, useGameState } from '../store/useGame';
import { useUI } from '../store/useUI';
import { useTransfersNav } from '../store/useTransfersNav';
import { useBoardNav } from '../store/useBoardNav';
import { respondToOffer } from '../../engine/trade';
import type { GameState, Message } from '../../engine/model';
import { formatDate, daysBetween } from '../format';
import { IconStandings, IconStaff, IconBoard, IconCalendar, IconMessages, IconTransfers, IconRoster, IconSquadHub } from '../components/tabIcons';
import styles from './MessagesScreen.module.css';

const KIND_ICON: Record<Message['kind'], typeof IconMessages> = {
  result: IconStandings,
  injury: IconStaff,
  board: IconBoard,
  league: IconCalendar,
  trade: IconMessages,
  finance: IconBoard,
  staff: IconStaff,
  draft: IconCalendar,
  event: IconTransfers,
  other: IconMessages
};

type Folder = 'all' | 'important' | 'offers' | 'team' | 'league' | 'archive';
const FOLDERS: { id: Folder; label: string; icon: typeof IconMessages }[] = [
  { id: 'all', label: 'All', icon: IconMessages },
  { id: 'important', label: 'Important', icon: IconBoard },
  { id: 'offers', label: 'Offers', icon: IconTransfers },
  { id: 'team', label: 'Team', icon: IconRoster },
  { id: 'league', label: 'League', icon: IconCalendar },
  { id: 'archive', label: 'Archive', icon: IconSquadHub }
];

const DIGEST_KINDS = new Set<Message['kind']>(['result', 'finance', 'league']);
const ARCHIVE_DAYS = 14;
const READ_DAYS = 3;
const MAX_MESSAGES = 200;
const ARCHIVE_KEY = 'bk-inbox-archived';

function loadManualArchive(): Set<number> {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}
function saveManualArchive(ids: Set<number>) {
  try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify([...ids])); } catch { /* ignore */ }
}

function folderKindOf(m: Message): 'offers' | 'team' | 'league' {
  if (m.kind === 'trade') return 'offers';
  if (m.kind === 'league') return 'league';
  return 'team';
}

/** Rotation top-9 by planned minutes, used to decide whether an injury is "important". */
function top9Ids(s: GameState): Set<string> {
  const team = s.teams[s.userTeamId];
  return new Set(Object.entries(team.minutes).sort((a, b) => b[1] - a[1]).slice(0, 9).map(([id]) => id));
}

function computeImportant(s: GameState, m: Message): boolean {
  if (m.kind === 'board' || m.kind === 'trade' || m.kind === 'event' || m.kind === 'draft') return true;
  if (m.action) return true;
  if (m.kind === 'injury') {
    const name = m.subject.replace(/ injured$/, '');
    const p = Object.values(s.players).find((x) => x.teamId === s.userTeamId && `${x.firstName} ${x.lastName}` === name);
    return !!p && top9Ids(s).has(p.id);
  }
  return false;
}

function isArchived(m: Message, s: GameState, manual: Set<number>): boolean {
  if (manual.has(m.id)) return true;
  return DIGEST_KINDS.has(m.kind) && daysBetween(m.date, s.date) >= ARCHIVE_DAYS;
}

/** A message with a live in-game action (trade offer / event) is "actioned" once that action resolves. */
function isActioned(m: Message, s: GameState): boolean {
  const action = m.action;
  if (action && action.type === 'trade-offer') return !s.tradeOffers.some((o) => o.id === action.offerId);
  if (action && action.type === 'event') { const ev = s.events.find((e) => e.id === action.eventId); return !ev || !!ev.resolved; }
  if (m.kind === 'other' && m.subject.startsWith('Press conference: questions waiting')) {
    const pending = s.press?.pending;
    return !pending || pending.date !== m.date || pending.answered.length >= pending.questions.length;
  }
  return false;
}

function matchesFolder(folder: Folder, m: Message, s: GameState, manual: Set<number>): boolean {
  const archived = isArchived(m, s, manual);
  if (folder === 'archive') return archived;
  if (archived) return false;
  if (folder === 'all') return true;
  if (folder === 'important') return !!m.important;
  return folderKindOf(m) === folder;
}

function digestLabel(kind: Message['kind'], items: Message[]): string {
  if (kind === 'result') {
    const wins = items.filter((m) => m.subject.startsWith('Win')).length;
    return `Match results — ${items.length} game${items.length === 1 ? '' : 's'} (${wins}-${items.length - wins})`;
  }
  if (kind === 'finance') return `Monthly finance — ${items.length} report${items.length === 1 ? '' : 's'}`;
  return `League news — ${items.length} item${items.length === 1 ? '' : 's'}`;
}

type VisibleItem = { key: string; ids: number[]; kind: 'msg' | 'digest'; m?: Message; digestKind?: Message['kind']; items?: Message[] };

export default function MessagesScreen() {
  const s = useGameState();
  const mutate = useGame((g) => g.mutate);
  const setTab = useUI((u) => u.setTab);
  const [folder, setFolder] = useState<Folder>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [offerResult, setOfferResult] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<Message['kind']>>(new Set());
  const [manualArchive, setManualArchive] = useState<Set<number>>(() => loadManualArchive());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [anchorIdx, setAnchorIdx] = useState<number | null>(null);

  // Persist derived `important`, auto-mark-read after 3 days, cap at 200 total.
  useEffect(() => {
    if (!s) return;
    const needsWork = s.messages.length > MAX_MESSAGES || s.messages.some((m) =>
      m.important === undefined || (DIGEST_KINDS.has(m.kind) && !m.read && daysBetween(m.date, s.date) >= READ_DAYS));
    if (!needsWork) return;
    mutate((st) => {
      for (const m of st.messages) {
        if (m.important === undefined) m.important = computeImportant(st, m);
        if (DIGEST_KINDS.has(m.kind) && !m.read && daysBetween(m.date, st.date) >= READ_DAYS) m.read = true;
      }
      if (st.messages.length > MAX_MESSAGES) st.messages.length = MAX_MESSAGES;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.messages.length, s?.date]);

  if (!s) return null;

  const setManual = (ids: Set<number>) => { setManualArchive(ids); saveManualArchive(ids); };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return s.messages
      .filter((m) => matchesFolder(folder, m, s, manualArchive))
      .filter((m) => !q || m.subject.toLowerCase().includes(q) || m.body.toLowerCase().includes(q) || m.from.toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.messages, s.date, folder, manualArchive, search]);

  const pinned = filtered.filter((m) => m.important && !isActioned(m, s));
  const restRaw = filtered.filter((m) => !(m.important && !isActioned(m, s)));

  const visible: VisibleItem[] = useMemo(() => {
    const out: VisibleItem[] = pinned.map((m) => ({ key: `m${m.id}`, ids: [m.id], kind: 'msg', m }));
    const seen = new Set<Message['kind']>();
    for (const m of restRaw) {
      if (DIGEST_KINDS.has(m.kind)) {
        if (seen.has(m.kind)) continue;
        seen.add(m.kind);
        const items = restRaw.filter((x) => x.kind === m.kind);
        out.push({ key: `d${m.kind}`, ids: items.map((x) => x.id), kind: 'digest', digestKind: m.kind, items });
      } else {
        out.push({ key: `m${m.id}`, ids: [m.id], kind: 'msg', m });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinned, restRaw]);

  const selected = selectedId != null ? s.messages.find((m) => m.id === selectedId) ?? null : null;

  const badgeFor = (folder: Folder) => s.messages.filter((m) => matchesFolder(folder, m, s, manualArchive) && !m.read && m.important).length;
  const railItems: SideRailItem<Folder>[] = FOLDERS.map((f) => ({ id: f.id, label: f.label, icon: f.icon, badge: badgeFor(f.id) }));

  const open = (m: Message) => {
    setSelectedId(m.id);
    setOfferResult(null);
    if (!m.read) mutate((st) => { const target = st.messages.find((x) => x.id === m.id); if (target) target.read = true; });
  };

  const dismiss = (m: Message) => mutate((st) => { const target = st.messages.find((x) => x.id === m.id); if (target) target.important = false; });

  const viewOffer = () => { useTransfersNav.getState().requestTab('offers'); setTab('transfers'); };

  const respond = (offerId: number, accept: boolean) => {
    let result: string | undefined;
    mutate((st) => { result = respondToOffer(st, offerId, accept); });
    if (result) { setOfferResult(result); toast(result, accept ? 'success' : 'info'); }
  };

  const toggleExpand = (kind: Message['kind']) => setExpanded((set) => {
    const next = new Set(set);
    next.has(kind) ? next.delete(kind) : next.add(kind);
    return next;
  });

  const rowClick = (item: VisibleItem, idx: number, e: MouseEvent) => {
    if (e.shiftKey && anchorIdx != null) {
      const [lo, hi] = anchorIdx < idx ? [anchorIdx, idx] : [idx, anchorIdx];
      const ids = new Set<number>();
      for (let i = lo; i <= hi; i++) visible[i].ids.forEach((id) => ids.add(id));
      setSelectedIds(ids);
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      setAnchorIdx(idx);
      setSelectedIds((set) => {
        const next = new Set(set);
        const allIn = item.ids.every((id) => next.has(id));
        item.ids.forEach((id) => (allIn ? next.delete(id) : next.add(id)));
        return next;
      });
      return;
    }
    setAnchorIdx(idx);
    setSelectedIds(new Set());
    if (item.kind === 'digest') toggleExpand(item.digestKind!);
    else open(item.m!);
  };

  const bulkMarkRead = () => {
    mutate((st) => { for (const m of st.messages) if (selectedIds.has(m.id)) m.read = true; });
    setSelectedIds(new Set());
  };
  const bulkArchive = () => {
    const next = new Set(manualArchive);
    selectedIds.forEach((id) => next.add(id));
    setManual(next);
    setSelectedIds(new Set());
  };

  return (
    <div className={styles.screen}>
      <HeroHeader title="Messages" subtitle="Inbox" />
      <div className={styles.wrap}>
        <SideRail items={railItems} active={folder} onSelect={(f) => { setFolder(f); setSelectedIds(new Set()); }} className={styles.rail} />
        <Panel title="Inbox" className={styles.listPanel} flush>
          <div className={styles.toolbar}>
            <input
              type="text"
              className={styles.search}
              placeholder="Search messages…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {selectedIds.size > 0 && (
              <div className={styles.bulkBar}>
                <span>{selectedIds.size} selected</span>
                <button type="button" className={styles.bulkBtn} onClick={bulkMarkRead}>Mark read</button>
                <button type="button" className={styles.bulkBtn} onClick={bulkArchive}>Archive</button>
              </div>
            )}
          </div>
          <div className={styles.list}>
            {visible.length === 0 && <div className={styles.empty}>No messages</div>}
            {visible.map((item, idx) => {
              const isSel = item.ids.some((id) => selectedIds.has(id));
              if (item.kind === 'digest') {
                const items = item.items!;
                const isOpen = expanded.has(item.digestKind!);
                const anyUnread = items.some((m) => !m.read);
                return (
                  <div key={item.key} className={styles.digestGroup}>
                    <button
                      type="button"
                      className={isSel ? `${styles.row} ${styles.digestRow} ${styles.rowSelected}` : `${styles.row} ${styles.digestRow}`}
                      onClick={(e) => rowClick(item, idx, e)}
                    >
                      <span className={styles.rowIcon}><IconCalendar /></span>
                      <span className={styles.rowBody}>
                        <span className={anyUnread ? `${styles.rowSubject} ${styles.unread}` : styles.rowSubject}>{digestLabel(item.digestKind!, items)}</span>
                        <span className={styles.rowMeta}>{isOpen ? 'Click to collapse' : 'Click to expand'}</span>
                      </span>
                      {anyUnread && <span className={styles.dot} />}
                    </button>
                    {isOpen && items.map((m) => {
                      const Icon = KIND_ICON[m.kind];
                      const rowSel = selectedIds.has(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={m.id === selected?.id ? `${styles.row} ${styles.rowChild} ${styles.rowActive}` : rowSel ? `${styles.row} ${styles.rowChild} ${styles.rowSelected}` : `${styles.row} ${styles.rowChild}`}
                          onClick={() => open(m)}
                        >
                          <span className={styles.rowIcon}><Icon /></span>
                          <span className={styles.rowBody}>
                            <span className={m.read ? styles.rowSubject : `${styles.rowSubject} ${styles.unread}`}>{m.subject}</span>
                            <span className={styles.rowMeta}>{m.from}, {formatDate(m.date)}</span>
                          </span>
                          {!m.read && <span className={styles.dot} />}
                        </button>
                      );
                    })}
                  </div>
                );
              }
              const m = item.m!;
              const Icon = KIND_ICON[m.kind];
              const isPinned = m.important && !isActioned(m, s);
              return (
                <div key={item.key} className={isPinned ? styles.pinnedWrap : undefined}>
                  <button
                    type="button"
                    className={[
                      styles.row,
                      m.id === selected?.id ? styles.rowActive : '',
                      isSel ? styles.rowSelected : '',
                      isPinned ? styles.pinnedRow : ''
                    ].filter(Boolean).join(' ')}
                    onClick={(e) => rowClick(item, idx, e)}
                  >
                    <span className={styles.rowIcon}><Icon /></span>
                    <span className={styles.rowBody}>
                      <span className={m.read ? styles.rowSubject : `${styles.rowSubject} ${styles.unread}`}>{m.subject}</span>
                      <span className={styles.rowMeta}>{m.from}, {formatDate(m.date)}</span>
                    </span>
                    {!m.read && <span className={styles.dot} />}
                  </button>
                  {isPinned && (
                    <div className={styles.pinnedActions}>
                      {m.action && m.action.type === 'trade-offer' && (() => {
                        const offerId = m.action.offerId;
                        return (
                          <>
                            <button type="button" className={styles.miniAccept} onClick={() => respond(offerId, true)}>Accept</button>
                            <button type="button" className={styles.miniDecline} onClick={() => respond(offerId, false)}>Decline</button>
                          </>
                        );
                      })()}
                      {m.action && m.action.type === 'event' && (() => {
                        const eventId = m.action.eventId;
                        return <button type="button" className={styles.miniOpen} onClick={() => useUI.getState().openEvent(eventId)}>Decide</button>;
                      })()}
                      {m.kind === 'other' && m.subject.startsWith('Press conference: questions waiting') && (
                        <button type="button" className={styles.miniOpen} onClick={() => { useBoardNav.getState().requestTab('media'); setTab('board'); }}>Answer</button>
                      )}
                      {!m.action && !(m.kind === 'other' && m.subject.startsWith('Press conference')) && (
                        <button type="button" className={styles.miniOpen} onClick={() => open(m)}>Open</button>
                      )}
                      <button type="button" className={styles.miniDismiss} title="Dismiss" onClick={() => dismiss(m)}>&times;</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Message" className={styles.readPanel}>
          {!selected && <div className={styles.empty}>Select a message</div>}
          {selected && (
            <div className={styles.reading}>
              <div className={styles.readingSubject}>{selected.subject}</div>
              <div className={styles.readingMeta}>From {selected.from}, {formatDate(selected.date)}</div>
              <div className={styles.readingBody}>{selected.body}</div>
              {selected.action?.type === 'trade-offer' && (() => {
                const offerId = selected.action.offerId;
                return (
                  <div className={styles.offerActions}>
                    {offerResult ? (
                      <div className={styles.offerResult}>{offerResult}</div>
                    ) : (
                      <>
                        <button type="button" className={styles.acceptBtn} onClick={() => respond(offerId, true)}>Accept</button>
                        <button type="button" className={styles.declineBtn} onClick={() => respond(offerId, false)}>Decline</button>
                      </>
                    )}
                    <button type="button" className={styles.viewOfferBtn} onClick={viewOffer}>View offer</button>
                  </div>
                );
              })()}
              {selected.action?.type === 'event' && (() => {
                const eventId = selected.action.eventId;
                return (
                  <div className={styles.offerActions}>
                    <button type="button" className={styles.viewOfferBtn} onClick={() => useUI.getState().openEvent(eventId)}>Decide</button>
                  </div>
                );
              })()}
              {selected.kind === 'other' && selected.subject.startsWith('Press conference: questions waiting') && (
                <div className={styles.offerActions}>
                  <button type="button" className={styles.viewOfferBtn} onClick={() => { useBoardNav.getState().requestTab('media'); setTab('board'); }}>Answer</button>
                </div>
              )}
              {selected.important && (
                <div className={styles.offerActions}>
                  <button type="button" className={styles.viewOfferBtn} onClick={() => dismiss(selected)}>Dismiss from Important</button>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
