import type { GameState } from '../../../engine/model';
import { hasAffiliate } from '../../../engine/gleague';
import type { TabId } from '../../store/useUI';

export interface NavItem { id: TabId; label: string; when?: (s: GameState) => boolean }
export interface NavGroup { id: string; label: string; items: NavItem[] }

/** Six areas, FM26-style: the band shows the areas, the row below shows the pages in the current one. */
export const NAV_GROUPS: NavGroup[] = [
  { id: 'home', label: 'Home', items: [
    { id: 'home', label: 'Overview' }, { id: 'messages', label: 'Inbox' }, { id: 'calendar', label: 'Calendar' },
  ] },
  { id: 'squad', label: 'Squad', items: [
    { id: 'roster', label: 'Roster' }, { id: 'training', label: 'Training' }, { id: 'playbook', label: 'Playbook' },
    { id: 'locker', label: 'Locker room' }, { id: 'squadHub', label: 'Contracts' },
    { id: 'gleague', label: 'G League', when: (s) => hasAffiliate(s, s.userTeamId) },
  ] },
  { id: 'market', label: 'Market', items: [{ id: 'transfers', label: 'Transfers' }, { id: 'draft', label: 'Draft and scouting' }] },
  { id: 'club', label: 'Club', items: [
    { id: 'staff', label: 'Staff' }, { id: 'facilities', label: 'Facilities' }, { id: 'finances', label: 'Finances' }, { id: 'board', label: 'Board and media' },
  ] },
  { id: 'league', label: 'League', items: [
    { id: 'standings', label: 'Standings' }, { id: 'league', label: 'League hub' },
    { id: 'moments', label: 'Season moments', when: (s) => !!s.calendar?.cup },
  ] },
  { id: 'career', label: 'Career', items: [{ id: 'career', label: 'Your career' }, { id: 'settings', label: 'Settings' }] },
];

export const groupOf = (tab: TabId) => NAV_GROUPS.find((g) => g.items.some((i) => i.id === tab))?.id ?? 'home';
