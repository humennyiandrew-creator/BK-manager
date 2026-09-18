import Panel from '../components/Panel';
import styles from './PlaceholderScreen.module.css';

interface Props {
  title: string;
}

export default function PlaceholderScreen({ title }: Props) {
  return (
    <div className={styles.wrap}>
      <Panel title={title} className={styles.panel}>
        <div className={styles.body}>{title} coming soon</div>
      </Panel>
    </div>
  );
}
