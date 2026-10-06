import type { ReactNode } from 'react';
import type { GameState } from '../../../engine/model';
import { leagueOf } from '../../../engine/leagues';
import { standings } from '../../../engine/season';
import type { TabId } from '../../store/useUI';
import BkImage from '../BkImage';
import { IconMessages, IconSettings } from '../tabIcons';
import { NAV_GROUPS, groupOf } from './nav';
import styles from './Band.module.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

interface Props {
  s: GameState;
  tab: TabId;
  onSelect: (tab: TabId) => void;
  badges: Partial<Record<TabId, number>>;
  continueSlot: ReactNode;
}

/** The club's uniform: crest patch, jersey wordmark, grouped navigation, scoreboard date, Continue. */
export default function Band({ s, tab, onSelect, badges, continueSlot }: Props) {
  const team = s.teams[s.userTeamId];
  const league = leagueOf(team.league);
  const unemployed = s.manager.unemployed;
  const table = standings(s, league.id === 'NBA' ? team.conference : undefined);
  const row = table.find((r) => r.teamId === team.id);
  const pos = row ? table.indexOf(row) + 1 : 0;
  const active = groupOf(tab);
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.when || i.when(s)) }));
  const current = groups.find((g) => g.id === active) ?? groups[0];
  const badgeFor = (ids: TabId[]) => ids.reduce((n, id) => n + (badges[id] ?? 0), 0);
  const [, m, d] = s.date.split('-').map(Number);

  return (
    <div className={styles.wrap}>
      <header className={styles.band}>
        <div className={styles.club}>
          <span className={styles.patch}><BkImage path={team.logo} alt={team.name} className={styles.crest} /></span>
          <span className={styles.clubText}>
            <span className={`${styles.wordmark} wordmark`}>{unemployed ? s.manager.name : team.name}</span>
            <span className={styles.standing}>
              {unemployed ? 'Between jobs' : row && row.w + row.l > 0
                ? `${row.w}–${row.l}, ${ordinal(pos)} in the ${league.id === 'NBA' ? team.conference : league.short}`
                : `${league.short} ${s.season}`}
            </span>
          </span>
        </div>

        <nav className={styles.groups}>
          {groups.map((g) => {
            const n = badgeFor(g.items.map((i) => i.id));
            return (
              <button key={g.id} type="button" className={g.id === active ? `${styles.group} ${styles.groupOn}` : styles.group} onClick={() => onSelect(g.items[0].id)} data-sound-hover>
                {g.label}
                {n > 0 && <span className={styles.dot} aria-label={`${n} new`} />}
              </button>
            );
          })}
        </nav>

        <div className={styles.right}>
          <button type="button" className={styles.iconBtn} onClick={() => onSelect('messages')} title="Inbox">
            <IconMessages className={styles.icon} />
            {(badges.messages ?? 0) > 0 && <span className={styles.count}>{badges.messages! > 99 ? '99+' : badges.messages}</span>}
          </button>
          <button type="button" className={styles.iconBtn} onClick={() => onSelect('settings')} title="Settings">
            <IconSettings className={styles.icon} />
          </button>
          <span className={styles.date}>
            <span className={`${styles.dateDay} led`}>{String(d).padStart(2, '0')}</span>
            <span className={styles.dateMonth}>{MONTHS[m - 1]}</span>
          </span>
          {continueSlot}
        </div>
      </header>
      <div className={styles.trim} aria-hidden="true" />
      <nav className={styles.sub}>
        {current.items.map((i) => (
          <button key={i.id} type="button" className={i.id === tab ? `${styles.subItem} ${styles.subOn}` : styles.subItem} onClick={() => onSelect(i.id)}>
            {i.label}
            {(badges[i.id] ?? 0) > 0 && <span className={styles.subCount}>{badges[i.id]}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}
