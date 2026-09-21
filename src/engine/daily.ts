// End-of-day hooks for management systems. Called by season.advanceDay after games.
import type { Game, GameState } from './model';
import { financeDaily } from './mgmt/finance';
import { facilitiesDaily } from './mgmt/facilities';
import { boardAfterGame } from './mgmt/board';
import { progressionDaily } from './progression';
import { trainingDaily } from './training';
import { aiTradeDaily } from './trade';
import { freeAgencyDaily } from './freeagency';
import { managerDaily } from './manager';
import { euroTransferDaily, returnLoans } from './transfers-euro';
import { eventsDaily } from './events';
import { scoutingWeekly } from './scouting';
import { programsWeekly } from './programs';
import { buildPrep, prepDaily } from './prep';
import { pressDaily } from './media';
import { checkPromises } from './mgmt/board';
import { sponsorsWeekly } from './sponsors';
import { staffWeekly } from './mgmt/staff';

export function dailyUpdate(s: GameState, playedToday: Game[]) {
  for (const g of playedToday) if (g.home === s.userTeamId || g.away === s.userTeamId) boardAfterGame(s, g);
  financeDaily(s, playedToday);
  facilitiesDaily(s);
  trainingDaily(s);
  progressionDaily(s);
  scoutingWeekly(s);
  programsWeekly(s);
  buildPrep(s);
  prepDaily(s);
  if (s.phase === 'regular' && s.date <= s.keyDates.tradeDeadline) aiTradeDaily(s);
  freeAgencyDaily(s);
  euroTransferDaily(s);
  returnLoans(s);
  managerDaily(s);
  eventsDaily(s);
  pressDaily(s, playedToday);
  checkPromises(s);
  sponsorsWeekly(s);
  staffWeekly(s);
}
