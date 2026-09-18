// End-of-day hooks for management systems. Called by season.advanceDay after games.
import type { Game, GameState } from './model';
import { financeDaily } from './mgmt/finance';
import { facilitiesDaily } from './mgmt/facilities';
import { boardAfterGame } from './mgmt/board';
import { progressionDaily } from './progression';
import { aiTradeDaily } from './trade';
import { freeAgencyDaily } from './freeagency';

export function dailyUpdate(s: GameState, playedToday: Game[]) {
  for (const g of playedToday) if (g.home === s.userTeamId || g.away === s.userTeamId) boardAfterGame(s, g);
  financeDaily(s, playedToday);
  facilitiesDaily(s);
  progressionDaily(s);
  if (s.phase === 'regular' && s.date <= s.keyDates.tradeDeadline) aiTradeDaily(s);
  freeAgencyDaily(s);
}
