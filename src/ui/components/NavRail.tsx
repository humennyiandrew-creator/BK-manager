import type { ComponentType } from 'react';
import type { TabId } from '../store/useUI';
import {
  IconHome, IconCareer, IconMessages, IconCalendar, IconRoster, IconSquadHub, IconTraining, IconPlaybook,
  IconTransfers, IconDraft, IconStaff, IconFacilities, IconBoard, IconFinances, IconStandings, IconSettings,
  IconLocker, IconLeague, IconCollapse, IconExpand
} from './tabIcons';
import styles from './NavRail.module.css';

interface NavDef { id: TabId; label: string; Icon: ComponentType<{ className?: string }> }

export const NAV_GROUPS: { label: string; items: NavDef[] }[] = [
  { label: 'Headquarters', items: [
    { id: 'home', label: 'Home', Icon: IconHome },
    { id: 'messages', label: 'Inbox', Icon: IconMessages },
    { id: 'calendar', label: 'Calendar', Icon: IconCalendar },
  ] },
  { label: 'Team', items: [
    { id: 'roster', label: 'Roster', Icon: IconRoster },
    { id: 'training', label: 'Training', Icon: IconTraining },
    { id: 'playbook', label: 'Playbook', Icon: IconPlaybook },
    { id: 'locker', label: 'Locker Room', Icon: IconLocker },
    { id: 'squadHub', label: 'Contracts', Icon: IconSquadHub },
  ] },
  { label: 'Market', items: [
    { id: 'transfers', label: 'Transfers', Icon: IconTransfers },
    { id: 'draft', label: 'Draft & Scouting', Icon: IconDraft },
  ] },
  { label: 'Club', items: [
    { id: 'staff', label: 'Staff', Icon: IconStaff },
    { id: 'facilities', label: 'Facilities', Icon: IconFacilities },
    { id: 'finances', label: 'Finances', Icon: IconFinances },
    { id: 'board', label: 'Board & Media', Icon: IconBoard },
  ] },
  { label: 'League', items: [
    { id: 'standings', label: 'Standings', Icon: IconStandings },
    { id: 'league', label: 'League Hub', Icon: IconLeague },
    { id: 'career', label: 'Career', Icon: IconCareer },
  ] },
];

interface Props {
  active: TabId;
  onSelect: (tab: TabId) => void;
  badges?: Partial<Record<TabId, number>>;
  collapsed: boolean;
  onToggle: () => void;
}

/** F1 Manager-style grouped side navigation. Collapses to an icon rail. */
export default function NavRail({ active, onSelect, badges, collapsed, onToggle }: Props) {
  const item = ({ id, label, Icon }: NavDef) => {
    const badge = badges?.[id];
    return (
      <button
        key={id}
        type="button"
        className={id === active ? `${styles.item} ${styles.active}` : styles.item}
        onClick={() => onSelect(id)}
        title={collapsed ? label : undefined}
        data-sound-hover
      >
        <Icon className={styles.icon} />
        <span className={styles.label}>{label}</span>
        {badge != null && badge > 0 && <span className={styles.badge}>{badge > 99 ? '99+' : badge}</span>}
      </button>
    );
  };
  return (
    <nav className={collapsed ? `${styles.rail} ${styles.collapsed}` : styles.rail}>
      <div className={styles.brand}>
        <span className={styles.brandMark}>//</span>
        <span className={styles.brandText}>BK<span>MANAGER</span></span>
      </div>
      <div className={styles.scroll}>
        {NAV_GROUPS.map((g) => (
          <div key={g.label} className={styles.group}>
            <div className={styles.groupLabel}>{g.label}</div>
            {g.items.map(item)}
          </div>
        ))}
      </div>
      <div className={styles.footer}>
        {item({ id: 'settings', label: 'Settings', Icon: IconSettings })}
        <button type="button" className={styles.toggle} onClick={onToggle} title={collapsed ? 'Expand menu' : 'Collapse menu'}>
          {collapsed ? <IconExpand className={styles.icon} /> : <IconCollapse className={styles.icon} />}
          <span className={styles.label}>Collapse</span>
        </button>
      </div>
    </nav>
  );
}
