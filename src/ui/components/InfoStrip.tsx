import CountUp from './CountUp';
import { formatMoney } from '../format';
import styles from './InfoStrip.module.css';

interface Props {
  nextGame: string;
  cash: number;
  date: string;
}

export default function InfoStrip({ nextGame, cash, date }: Props) {
  return (
    <div className={`${styles.strip} chevron-stripe`}>
      <div className={styles.cell}>
        <span className={styles.cellLabel}>Next</span>
        <span className={styles.cellValue}>{nextGame}</span>
      </div>
      <div className={styles.cell}>
        <span className={styles.cellLabel}>Cash</span>
        <CountUp value={cash} formatter={formatMoney} className="mono-num" />
      </div>
      <div className={styles.cell}>
        <span className={`${styles.cellValue} mono-num`}>{date}</span>
      </div>
    </div>
  );
}
