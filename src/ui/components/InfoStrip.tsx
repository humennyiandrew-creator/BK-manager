import styles from './InfoStrip.module.css';

interface Props {
  nextGame: string;
  cash: string;
  date: string;
}

export default function InfoStrip({ nextGame, cash, date }: Props) {
  return (
    <div className={styles.strip}>
      <div className={styles.cell}>
        <span className={styles.cellLabel}>Next</span>
        <span>{nextGame}</span>
      </div>
      <div className={styles.cell}>
        <span className={styles.cellLabel}>Cash</span>
        <span>{cash}</span>
      </div>
      <div className={styles.cell}>
        <span>{date}</span>
      </div>
    </div>
  );
}
