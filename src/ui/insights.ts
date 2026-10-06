// Assistant coach's "action items": what needs the manager's attention right now, each with a jump.
import type { GameState, Player } from '../engine/model';
import { pendingUserEvent } from '../engine/events';
import { boardMeetingAvailable } from '../engine/mgmt/board';
import { extensionEligible } from '../engine/negotiation';
import { chemistryReport, lockerRoom } from '../engine/chemistry';
import { leagueOf } from '../engine/leagues';
import { ARC_LABEL } from '../engine/arcs';
import { useUI, type TabId } from './store/useUI';
import { useBoardNav } from './store/useBoardNav';
import { useTransfersNav } from './store/useTransfersNav';

export type InsightTone = 'urgent' | 'warn' | 'good' | 'info';
export interface Insight { id: string; tone: InsightTone; title: string; detail: string; cta: string; go: () => void; playerId?: string }

const ORDER: Record<InsightTone, number> = { urgent: 0, warn: 1, good: 2, info: 3 };
const tab = (t: TabId) => () => useUI.getState().setTab(t);
const player = (id: string) => () => useUI.getState().openPlayer(id);
const mpg = (p: Player) => (p.season.gp ? p.season.min / p.season.gp : 0);

export function coachInsights(s: GameState, limit = 8): Insight[] {
  if (s.manager.unemployed) return [];
  const out: Insight[] = [];
  const team = s.teams[s.userTeamId];
  const roster = Object.values(s.players).filter((p) => p.teamId === s.userTeamId && !p.retired);
  const name = (p: Player) => `${p.firstName[0]}. ${p.lastName}`;

  const ev = pendingUserEvent(s);
  if (ev) out.push({ id: 'event', tone: 'urgent', title: ev.title, detail: 'A decision is waiting before we can move on.', cta: 'Decide', go: () => useUI.getState().openEvent(ev.id) });
  if (s.press?.pending) out.push({ id: 'press', tone: 'warn', title: 'Press conference', detail: 'The media are waiting for answers.', cta: 'Answer', go: () => { useBoardNav.getState().requestTab('media'); useUI.getState().setTab('board'); } });
  if (s.tradeOffers.length) out.push({ id: 'offers', tone: 'info', title: `${s.tradeOffers.length} trade offer${s.tradeOffers.length === 1 ? '' : 's'} on the table`, detail: 'Rival front offices want to deal.', cta: 'Review', go: () => { useTransfersNav.getState().requestTab('offers'); useUI.getState().setTab('transfers'); } });

  const starters = team.rotation.slice(0, 5).map((id) => s.players[id]).filter(Boolean);
  const hurt = roster.filter((p) => p.injury && p.injury.name !== 'Suspension' && p.ratings.ovr >= 75).sort((a, b) => b.ratings.ovr - a.ratings.ovr)[0];
  if (hurt) out.push({ id: `inj${hurt.id}`, tone: 'warn', title: `${name(hurt)} is out`, detail: `${hurt.injury!.name} — ${hurt.injury!.daysLeft} more day${hurt.injury!.daysLeft === 1 ? '' : 's'}. Check the rotation.`, cta: 'Rotation', go: tab('playbook'), playerId: hurt.id });

  const tired = roster.filter((p) => (p.fatigue ?? 0) >= 70 && !p.injury).sort((a, b) => (b.fatigue ?? 0) - (a.fatigue ?? 0));
  if (tired.length) out.push({ id: 'fatigue', tone: 'warn', title: `${tired.slice(0, 2).map(name).join(', ')}${tired.length > 2 ? ` +${tired.length - 2}` : ''} running on fumes`, detail: 'Fatigue above 70 slows development and raises injury risk. Schedule a rest day.', cta: 'Training', go: tab('training') });

  for (const p of roster) {
    const a = p.arc;
    if (!a?.revealed || a.season !== s.season) continue;
    out.push(a.kind === 'breakout'
      ? { id: `arc${p.id}`, tone: 'good', title: `${name(p)}: breakout season`, detail: `${ARC_LABEL[a.style]} — up ${a.applied} OVR this year.`, cta: 'Profile', go: player(p.id), playerId: p.id }
      : { id: `arc${p.id}`, tone: 'warn', title: `${name(p)}: deep slump`, detail: `${ARC_LABEL[a.style]} — down ${-a.applied} OVR this year.`, cta: 'Profile', go: player(p.id), playerId: p.id });
  }

  const hot = roster.filter((p) => (p.form ?? 0) >= 1.5 && mpg(p) < 22 && !p.injury).sort((a, b) => (b.form ?? 0) - (a.form ?? 0))[0];
  if (hot) out.push({ id: `hot${hot.id}`, tone: 'good', title: `${name(hot)} is producing`, detail: `Well above his rating in only ${mpg(hot).toFixed(0)} mpg. Find him more minutes?`, cta: 'Rotation', go: tab('playbook'), playerId: hot.id });
  const cold = starters.filter((p) => (p.form ?? 0) <= -1.5 && !p.injury).sort((a, b) => (a.form ?? 0) - (b.form ?? 0))[0];
  if (cold) out.push({ id: `cold${cold.id}`, tone: 'warn', title: `${name(cold)} is struggling`, detail: 'Playing well below his rating as a starter.', cta: 'Profile', go: player(cold.id), playerId: cold.id });

  const sad = roster.filter((p) => p.morale < 35).sort((a, b) => a.morale - b.morale)[0];
  if (sad) out.push({ id: `sad${sad.id}`, tone: 'warn', title: `${name(sad)} is unhappy`, detail: `Morale ${sad.morale}. A 1-on-1 meeting might help.`, cta: 'Talk', go: player(sad.id), playerId: sad.id });

  const lr = lockerRoom(s);
  const chem = chemistryReport(s, s.userTeamId);
  if (!lr.captain || s.players[lr.captain]?.teamId !== s.userTeamId) out.push({ id: 'captain', tone: 'info', title: 'Name a team captain', detail: 'A good leader steadies the locker room.', cta: 'Locker Room', go: tab('locker') });
  if (chem.score < 45) out.push({ id: 'chem', tone: 'warn', title: `Locker room is ${chem.mood.toLowerCase()}`, detail: `Chemistry ${chem.score}. Team activities can help.`, cta: 'Locker Room', go: tab('locker') });

  if (s.prep && !s.prep.prepared && s.phase !== 'offseason') out.push({ id: 'prep', tone: 'info', title: `Scouting report: ${s.teams[s.prep.opponent].name}`, detail: 'Set a game plan before tip-off.', cta: 'Game Plan', go: tab('training') });
  if ((team.familiarity ?? 60) < 50) out.push({ id: 'fam', tone: 'info', title: 'Still learning the system', detail: `Tactical familiarity ${Math.round(team.familiarity ?? 60)}. Film and practice sessions help.`, cta: 'Training', go: tab('training') });
  const ext = extensionEligible(s).length;
  if (ext) out.push({ id: 'ext', tone: 'info', title: `${ext} player${ext === 1 ? '' : 's'} eligible for an extension`, detail: 'Lock up key players before they hit the market.', cta: 'Contracts', go: tab('squadHub') });
  if (boardMeetingAvailable(s)) out.push({ id: 'board', tone: 'info', title: 'Board meeting available', detail: 'Ownership will hear your requests.', cta: 'Board', go: () => { useBoardNav.getState().requestTab('meeting'); useUI.getState().setTab('board'); } });
  const minRoster = leagueOf(team.league).id === 'NBA' ? 13 : 10;
  if (roster.length < minRoster && s.phase !== 'offseason') out.push({ id: 'roster', tone: 'urgent', title: `Only ${roster.length} players on the roster`, detail: `Sign at least ${minRoster - roster.length} more.`, cta: 'Free Agents', go: () => { useTransfersNav.getState().requestTab('fa'); useUI.getState().setTab('transfers'); } });
  if (!roster.some((p) => p.program) && s.phase !== 'offseason') out.push({ id: 'programs', tone: 'info', title: 'No development programmes running', detail: 'Up to three players can follow a targeted plan.', cta: 'Training', go: tab('training') });

  return out.sort((a, b) => ORDER[a.tone] - ORDER[b.tone]).slice(0, limit);
}
