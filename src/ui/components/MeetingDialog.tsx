import { useState } from 'react';
import type { GameState } from '../../engine/model';
import { MEETING_TOPICS, holdMeeting, type MeetingTopicId } from '../../engine/meetings';
import { play } from '../sound';
import styles from './MeetingDialog.module.css';

interface Props { s: GameState; playerId: string; mutate: (fn: (s: GameState) => void) => void; onClose: () => void }

export default function MeetingDialog({ s, playerId, mutate, onClose }: Props) {
  const p = s.players[playerId];
  const [topicId, setTopicId] = useState<MeetingTopicId | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const topic = MEETING_TOPICS.find((t) => t.id === topicId);

  const respond = (responseId: string) => {
    if (!topicId) return;
    let result = '';
    mutate((st) => { result = holdMeeting(st, playerId, topicId, responseId); });
    setOutcome(result);
    play('confirm');
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>1-on-1 with {p.firstName} {p.lastName}</div>
        {outcome ? (
          <>
            <p className={styles.outcome}>{outcome}</p>
            <div className={styles.btns}><button type="button" className={styles.confirmBtn} onClick={onClose}>Done</button></div>
          </>
        ) : !topic ? (
          <div className={styles.list}>
            {MEETING_TOPICS.map((t) => (
              <button key={t.id} type="button" className={styles.optBtn} onClick={() => setTopicId(t.id)}>{t.label}</button>
            ))}
          </div>
        ) : (
          <div className={styles.list}>
            {topic.responses.map((r) => (
              <button key={r.id} type="button" className={styles.optBtn} onClick={() => respond(r.id)}>{r.label}</button>
            ))}
          </div>
        )}
        {!outcome && <div className={styles.btns}><button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button></div>}
      </div>
    </div>
  );
}
