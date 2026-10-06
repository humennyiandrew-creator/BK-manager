import BkImage from './BkImage';
import styles from './PlayerCard.module.css';

interface Props {
  rank: number;
  rankTrend?: 'up' | 'down' | 'none';
  facePath: string | null;
  firstName: string;
  lastName: string;
  subtitle: string;
  className?: string;
}

export default function PlayerCard({ rank, rankTrend = 'none', facePath, firstName, lastName, subtitle, className }: Props) {
  return (
    <div className={`${styles.card} ${className ?? ''}`}>
      <div className={styles.imageWrap}>
        <div className={styles.rank}>
          <span>{rank}</span>
          {rankTrend === 'up' && <span className={styles.arrowUp}>&#9650;</span>}
          {rankTrend === 'down' && <span className={styles.arrowDown}>&#9660;</span>}
        </div>
        <BkImage path={facePath} alt={`${firstName} ${lastName}`} />
      </div>
      <div className={styles.info}>
        <span className={styles.first}>{firstName}</span>
        <span className={styles.last}>{lastName}</span>
        <span className={styles.subtitle}>{subtitle}</span>
      </div>
    </div>
  );
}
