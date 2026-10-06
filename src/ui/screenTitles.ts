import type { TabId } from './store/useUI';

/** Per-tab title/subtitle for each screen's HeroHeader. */
export const TAB_TITLES: Record<TabId, { title: string; subtitle: string }> = {
  home: { title: 'Home', subtitle: 'Team overview' },
  career: { title: 'Career', subtitle: 'Job market and coaching record' },
  messages: { title: 'Messages', subtitle: 'Inbox and notifications' },
  calendar: { title: 'Calendar', subtitle: 'Season schedule' },
  roster: { title: 'Roster', subtitle: 'Player list and depth chart' },
  squadHub: { title: 'Squad Hub', subtitle: 'Contracts and cap sheet' },
  training: { title: 'Training', subtitle: 'Practice plans' },
  playbook: { title: 'Playbook', subtitle: 'Tactics and set plays' },
  locker: { title: 'Locker room', subtitle: 'Chemistry, leadership and team activities' },
  gleague: { title: 'G League', subtitle: 'Your affiliate' },
  transfers: { title: 'Transfers', subtitle: 'Trade and free agency' },
  draft: { title: 'Draft', subtitle: 'Prospect scouting' },
  staff: { title: 'Staff', subtitle: 'Coaching and front office' },
  facilities: { title: 'Facilities', subtitle: 'Arena and training center' },
  board: { title: 'Board', subtitle: 'Ownership expectations' },
  finances: { title: 'Finances', subtitle: 'Budget and payroll' },
  standings: { title: 'Standings', subtitle: 'League table' },
  league: { title: 'League hub', subtitle: 'Power rankings, storylines and award races' },
  moments: { title: 'Season moments', subtitle: 'NBA Cup, All-Star weekend, the deadline and awards night' },
  settings: { title: 'Settings', subtitle: 'Preferences' }
};
