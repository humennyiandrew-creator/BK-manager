import Panel from '../components/Panel';
import { TAB_TITLES } from '../screenTitles';
import type { TabId } from '../store/useUI';
import styles from './PlaceholderScreen.module.css';

/** Shown instead of a management screen's content while the manager has no club. */
export default function BetweenJobsScreen({ tab }: { tab: TabId }) {
  const { title } = TAB_TITLES[tab];
  return (
    <div className={styles.wrap}>
      <Panel title={title} className={styles.panel}>
        <div className={styles.body}>You are between jobs</div>
      </Panel>
    </div>
  );
}
