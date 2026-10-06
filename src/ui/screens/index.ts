import type { ComponentType } from 'react';
import type { TabId } from '../store/useUI';
import HomeScreen from './HomeScreen';
import CareerScreen from './CareerScreen';
import MessagesScreen from './MessagesScreen';
import CalendarScreen from './CalendarScreen';
import RosterScreen from './RosterScreen';
import SquadHubScreen from './SquadHubScreen';
import TrainingScreen from './TrainingScreen';
import PlaybookScreen from './PlaybookScreen';
import TransfersScreen from './TransfersScreen';
import DraftScreen from './DraftScreen';
import StaffScreen from './StaffScreen';
import FacilitiesScreen from './FacilitiesScreen';
import BoardScreen from './BoardScreen';
import FinancesScreen from './FinancesScreen';
import StandingsScreen from './StandingsScreen';
import SettingsScreen from './SettingsScreen';
import LockerRoomScreen from './LockerRoomScreen';
import LeagueScreen from './LeagueScreen';
import GLeagueScreen from './GLeagueScreen';
import MomentsScreen from './MomentsScreen';

export const SCREENS: Record<TabId, ComponentType> = {
  home: HomeScreen,
  career: CareerScreen,
  messages: MessagesScreen,
  calendar: CalendarScreen,
  roster: RosterScreen,
  squadHub: SquadHubScreen,
  training: TrainingScreen,
  playbook: PlaybookScreen,
  locker: LockerRoomScreen,
  gleague: GLeagueScreen,
  transfers: TransfersScreen,
  draft: DraftScreen,
  staff: StaffScreen,
  facilities: FacilitiesScreen,
  board: BoardScreen,
  finances: FinancesScreen,
  standings: StandingsScreen,
  league: LeagueScreen,
  moments: MomentsScreen,
  settings: SettingsScreen
};
