import { useState } from 'react';
import type { GameState } from '../../engine/model';
import { resolveEvent } from '../../engine/events';
import { useGame } from '../store/useGame';
import BkImage from './BkImage';
import { IconTransfers, IconStaff, IconBoard, IconFinances, IconTraining, IconMessages } from './tabIcons';
import styles from './EventModal.module.css';

const TYPE_ICON: Record<string, typeof IconMessages> = {
  'trade-request': IconTransfers,
  'locker-fight': IconStaff,
  'off-court-incident': IconStaff,
  'breakout-hype': IconTraining,
  'injury-setback': IconStaff,
  'contract-holdout': IconTransfers,
  'staff-poach': IconStaff,
  'owner-demands': IconBoard,
  'media-controversy': IconBoard,
  'fan-protest': IconFinances,
  'sponsor-offer': IconFinances,
  'youth-ask': IconTraining,
  'veteran-mentor': IconTraining,
  'illness-outbreak': IconStaff,
  'charity-event': IconFinances
};

const TYPE_LABEL: Record<string, string> = {
  'trade-request': 'Trade Request',
  'locker-fight': 'Locker Room',
  'off-court-incident': 'Off-Court Incident',
  'breakout-hype': 'Breakout Performance',
  'injury-setback': 'Injury Update',
  'contract-holdout': 'Contract Situation',
  'staff-poach': 'Front Office',
  'owner-demands': 'Ownership',
  'media-controversy': 'Media',
  'fan-protest': 'Fan Relations',
  'sponsor-offer': 'Sponsorship',
  'youth-ask': 'Player Development',
  'veteran-mentor': 'Mentorship',
  'illness-outbreak': 'Medical',
  'charity-event': 'Community'
};

export default function EventModal({ s, eventId, onClose }: { s: GameState; eventId: string; onClose: () => void }) {
  const mutate = useGame((g) => g.mutate);
  const [picking, setPicking] = useState(false);
  const ev = s.events.find((e) => e.id === eventId);
  if (!ev) return null;
  const Icon = TYPE_ICON[ev.type] ?? IconMessages;
  const player = ev.playerId ? s.players[ev.playerId] : null;

  const choose = (choiceId: string) => {
    setPicking(true);
    mutate((st) => { resolveEvent(st, ev.id, choiceId); });
  };

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.headerIcon}><Icon /></span>
          <div className={styles.headerText}>
            <div className={styles.kicker}>{TYPE_LABEL[ev.type] ?? 'Event'}</div>
            <div className={styles.title}>{ev.title}</div>
          </div>
        </div>
        {player && (
          <div className={styles.playerRow}>
            <BkImage path={player.face} alt={player.lastName} className={styles.playerFace} />
            <div>
              <div className={styles.playerName}>{player.firstName} {player.lastName}</div>
              <div className={styles.playerMeta}>{player.positions.join('/')} · OVR {player.ratings.ovr} · Morale {player.morale}</div>
            </div>
          </div>
        )}
        <div className={styles.body}>{ev.body}</div>
        {!ev.resolved ? (
          <div className={styles.choices}>
            {ev.choices.map((c) => (
              <button key={c.id} type="button" className={styles.choiceBtn} disabled={picking} onClick={() => choose(c.id)}>
                <span className={styles.choiceLabel}>{c.label}</span>
                <span className={styles.choiceHint}>{c.hint}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.outcome}>
            <div className={styles.outcomeLabel}>Outcome</div>
            <div className={styles.outcomeText}>{ev.resolved.outcome}</div>
            <button type="button" className={styles.doneBtn} onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
