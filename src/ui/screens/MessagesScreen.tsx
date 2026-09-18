import { useState } from 'react';
import Panel from '../components/Panel';
import { useGame, useGameState } from '../store/useGame';
import { useUI } from '../store/useUI';
import { useTransfersNav } from '../store/useTransfersNav';
import { respondToOffer } from '../../engine/trade';
import type { Message } from '../../engine/model';
import { formatDate } from '../format';
import { IconStandings, IconStaff, IconBoard, IconCalendar, IconMessages } from '../components/tabIcons';
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
  other: IconMessages
};

export default function MessagesScreen() {
  const s = useGameState();
  const mutate = useGame((g) => g.mutate);
  const setTab = useUI((u) => u.setTab);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [offerResult, setOfferResult] = useState<string | null>(null);

  if (!s) return null;
  const messages = s.messages;
  const selected = messages.find((m) => m.id === selectedId) ?? messages[0] ?? null;

  const open = (m: Message) => {
    setSelectedId(m.id);
    setOfferResult(null);
    if (!m.read) mutate((st) => { const target = st.messages.find((x) => x.id === m.id); if (target) target.read = true; });
  };

  const viewOffer = () => {
    useTransfersNav.getState().requestTab('offers');
    setTab('transfers');
  };

  const respond = (offerId: number, accept: boolean) => {
    let result: string | undefined;
    mutate((st) => { result = respondToOffer(st, offerId, accept); });
    if (result) setOfferResult(result);
  };

  return (
    <div className={styles.wrap}>
      <Panel title="Inbox" className={styles.listPanel} flush>
        <div className={styles.list}>
          {messages.length === 0 && <div className={styles.empty}>No messages</div>}
          {messages.map((m) => {
            const Icon = KIND_ICON[m.kind];
            return (
              <button
                key={m.id}
                type="button"
                className={m.id === selected?.id ? `${styles.row} ${styles.rowActive}` : styles.row}
                onClick={() => open(m)}
              >
                <span className={styles.rowIcon}><Icon /></span>
                <span className={styles.rowBody}>
                  <span className={m.read ? styles.rowSubject : `${styles.rowSubject} ${styles.unread}`}>{m.subject}</span>
                  <span className={styles.rowMeta}>{m.from} · {formatDate(m.date)}</span>
                </span>
                {!m.read && <span className={styles.dot} />}
              </button>
            );
          })}
        </div>
      </Panel>
      <Panel title="Message" className={styles.readPanel}>
        {!selected && <div className={styles.empty}>Select a message</div>}
        {selected && (
          <div className={styles.reading}>
            <div className={styles.readingSubject}>{selected.subject}</div>
            <div className={styles.readingMeta}>From {selected.from} · {formatDate(selected.date)}</div>
            <div className={styles.readingBody}>{selected.body}</div>
            {selected.action?.type === 'trade-offer' && (
              <div className={styles.offerActions}>
                {offerResult ? (
                  <div className={styles.offerResult}>{offerResult}</div>
                ) : (
                  <>
                    <button type="button" className={styles.acceptBtn} onClick={() => respond(selected.action!.offerId, true)}>Accept</button>
                    <button type="button" className={styles.declineBtn} onClick={() => respond(selected.action!.offerId, false)}>Decline</button>
                  </>
                )}
                <button type="button" className={styles.viewOfferBtn} onClick={viewOffer}>View offer</button>
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
