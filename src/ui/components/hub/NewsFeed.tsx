import type { GameState, NewsItem, NewsKind } from '../../../engine/model';
import { daysBetween } from '../../../engine/schedule';
import { useUI } from '../../store/useUI';
import BkImage from '../BkImage';
import styles from './NewsFeed.module.css';

const KIND_LABEL: Record<NewsKind, string> = {
  breakout: 'Breakout', slump: 'Slump', performance: 'Big night', streak: 'Streak', injury: 'Injury',
  award: 'Award', rankings: 'Rankings', milestone: 'Milestone', other: 'Wire',
};

const ago = (s: GameState, d: string) => {
  const n = daysBetween(d, s.date);
  return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n}d ago`;
};

interface Props { s: GameState; items?: NewsItem[]; limit?: number; empty?: string }

/** League wire: storylines from around the league, newest first. Click a story to open the player. */
export default function NewsFeed({ s, items, limit = 8, empty = 'Quiet around the league so far.' }: Props) {
  const list = (items ?? s.news ?? []).slice(0, limit);
  const openPlayer = useUI((u) => u.openPlayer);
  if (!list.length) return <div className={styles.empty}>{empty}</div>;
  return (
    <div className={styles.feed}>
      {list.map((n) => {
        const team = n.teamId ? s.teams[n.teamId] : undefined;
        const mine = n.teamId === s.userTeamId;
        const p = n.playerId ? s.players[n.playerId] : undefined;
        return (
          <button
            key={n.id}
            type="button"
            className={`${styles.item} ${styles[n.tone ?? 'neutral']} ${mine ? styles.mine : ''}`}
            onClick={() => p && openPlayer(p.id)}
            disabled={!p}
          >
            <div className={styles.thumb}>
              {p?.face ? <BkImage path={p.face} alt={p.lastName} className={styles.face} /> : team ? <BkImage path={team.logo} alt={team.abbr} className={styles.logo} /> : null}
            </div>
            <div className={styles.body}>
              <div className={styles.meta}>
                <span className={styles.kind}>{KIND_LABEL[n.kind]}</span>
                {team && <span className={styles.team}>{team.abbr}</span>}
                <span className={styles.when}>{ago(s, n.date)}</span>
              </div>
              <div className={styles.headline}>{n.headline}</div>
              {n.body && <div className={styles.text}>{n.body}</div>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
