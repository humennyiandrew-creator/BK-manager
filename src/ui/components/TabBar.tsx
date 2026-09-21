import type { ComponentType } from 'react';
import type { TabId } from '../store/useUI';
import styles from './TabBar.module.css';
import {
  IconHome,
  IconCareer,
  IconMessages,
  IconCalendar,
  IconRoster,
  IconSquadHub,
  IconTraining,
  IconPlaybook,
  IconTransfers,
  IconDraft,
  IconStaff,
  IconFacilities,
  IconBoard,
  IconFinances,
  IconStandings,
  IconSettings
} from './tabIcons';

interface TabDef {
  id: TabId;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}

const TABS: TabDef[] = [
  { id: 'home', label: 'Home', Icon: IconHome },
  { id: 'career', label: 'Career', Icon: IconCareer },
  { id: 'messages', label: 'Messages', Icon: IconMessages },
  { id: 'calendar', label: 'Calendar', Icon: IconCalendar },
  { id: 'roster', label: 'Roster', Icon: IconRoster },
  { id: 'squadHub', label: 'Squad Hub', Icon: IconSquadHub },
  { id: 'training', label: 'Training', Icon: IconTraining },
  { id: 'playbook', label: 'Playbook', Icon: IconPlaybook },
  { id: 'transfers', label: 'Transfers', Icon: IconTransfers },
  { id: 'draft', label: 'Draft', Icon: IconDraft },
  { id: 'staff', label: 'Staff', Icon: IconStaff },
  { id: 'facilities', label: 'Facilities', Icon: IconFacilities },
  { id: 'board', label: 'Board', Icon: IconBoard },
  { id: 'finances', label: 'Finances', Icon: IconFinances },
  { id: 'standings', label: 'Standings', Icon: IconStandings },
  { id: 'settings', label: 'Settings', Icon: IconSettings }
];

interface Props {
  active: TabId;
  onSelect: (tab: TabId) => void;
  badges?: Partial<Record<TabId, number>>;
}

export default function TabBar({ active, onSelect, badges }: Props) {
  const activeIndex = TABS.findIndex((t) => t.id === active);
  return (
    <nav className={styles.bar}>
      <span
        className={styles.indicator}
        style={{ width: `${100 / TABS.length}%`, transform: `translateX(${activeIndex * 100}%)` }}
      />
      {TABS.map(({ id, label, Icon }) => {
        const badge = badges?.[id];
        return (
          <button
            key={id}
            type="button"
            className={id === active ? `${styles.tab} ${styles.active}` : styles.tab}
            onClick={() => onSelect(id)}
            data-sound-hover
          >
            {badge != null && badge > 0 && <span className={styles.badge}>{badge}</span>}
            <Icon />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
