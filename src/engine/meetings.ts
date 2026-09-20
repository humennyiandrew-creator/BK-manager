// 1-on-1 player meetings: role/minutes, trade request, motivation. 14-day cooldown.
import type { GameEvent, GameState } from './model';
import { hashString, mulberry32 } from './rng';
import { addDays, daysBetween } from './schedule';
import { clamp } from './mgmt/market';

export type MeetingTopicId = 'role' | 'trade' | 'motivation';
export interface MeetingResponse { id: string; label: string }
export interface MeetingTopic { id: MeetingTopicId; label: string; responses: MeetingResponse[] }

export const MEETING_TOPICS: MeetingTopic[] = [
  {
    id: 'role', label: 'Role & Minutes',
    responses: [
      { id: 'reassure', label: 'Reassure him his role is safe' },
      { id: 'blunt', label: 'Be blunt about where he stands' },
      { id: 'ask', label: 'Ask what he needs to see' },
    ],
  },
  {
    id: 'trade', label: 'Trade Request',
    responses: [
      { id: 'commit', label: "Tell him he's part of our plans" },
      { id: 'open', label: "Admit we're listening to offers" },
      { id: 'silence', label: 'Decline to discuss it' },
    ],
  },
  {
    id: 'motivation', label: 'Motivation',
    responses: [
      { id: 'praise', label: 'Praise his recent work' },
      { id: 'challenge', label: 'Challenge him to do more' },
      { id: 'checkin', label: 'Just check in' },
    ],
  },
];

const COOLDOWN_DAYS = 14;

export function canMeet(s: GameState, playerId: string): boolean {
  const p = s.players[playerId];
  if (!p) return false;
  if (!p.lastMeeting) return true;
  return daysBetween(p.lastMeeting, s.date) >= COOLDOWN_DAYS;
}

function msg(s: GameState, subject: string, body: string) {
  s.messages.unshift({ id: s.nextId++, date: s.date, from: 'Front Office', subject, body, read: false, kind: 'other' });
}

const DELTAS: Record<MeetingTopicId, Record<string, number>> = {
  role: { reassure: 6, blunt: -5, ask: 4 },
  trade: { commit: 8, open: 2, silence: -6 },
  motivation: { praise: 7, challenge: -1, checkin: 5 },
};

/** Occasionally calm (or, rarely, spark) a trade-request event, matching the shape events.ts pushes. */
function pushTradeRequest(s: GameState, playerId: string): void {
  const p = s.players[playerId];
  const ev: GameEvent = {
    id: `ev${s.nextId++}`, date: s.date, type: 'trade-request', playerId,
    title: `${p.firstName} ${p.lastName} requests a trade`,
    body: `${p.firstName} ${p.lastName} left the meeting unhappy and has asked to be moved.`,
    teamId: s.userTeamId,
    choices: [
      { id: 'minutes', label: 'Promise more minutes', hint: 'Morale rises now — but his minutes must actually climb within a month, or the next drop is worse.' },
      { id: 'shop', label: 'Quietly shop him', hint: 'Explore the trade market; morale improves a little knowing a way out exists.' },
      { id: 'refuse', label: 'Refuse the request', hint: 'Morale drops further. A high-ego player may leak this to the media.' },
    ],
    expires: addDays(s.date, 3),
  };
  s.events.unshift(ev);
  if (s.events.length > 60) s.events.length = 60;
  msg(s, ev.title, ev.body);
}

function calmPendingTradeRequest(s: GameState, playerId: string): boolean {
  const ev = s.events.find((e) => !e.resolved && e.teamId === s.userTeamId && e.type === 'trade-request' && e.playerId === playerId);
  if (!ev) return false;
  const p = s.players[playerId];
  ev.resolved = { choiceId: 'minutes', outcome: `${p.firstName} ${p.lastName} settles down after a good conversation.` };
  msg(s, `${ev.title} — resolved`, ev.resolved.outcome);
  return true;
}

/** Run a 1-on-1. Returns an outcome message, or an error string if not allowed. */
export function holdMeeting(s: GameState, playerId: string, topicId: MeetingTopicId, responseId: string): string {
  const p = s.players[playerId];
  if (!p) return 'Player not found';
  if (!canMeet(s, playerId)) return 'Too soon for another meeting with this player';
  const base = DELTAS[topicId]?.[responseId] ?? 0;
  const rng = mulberry32(hashString(`${s.seed}|meeting|${playerId}|${s.date}|${topicId}|${responseId}`));
  const delta = clamp(base + Math.round((rng() - 0.5) * 6), -12, 12);
  p.morale = Math.round(clamp(p.morale + delta, 0, 100));
  p.lastMeeting = s.date;

  let extra = '';
  if (topicId === 'trade' && (responseId === 'commit' || responseId === 'open')) {
    if (calmPendingTradeRequest(s, playerId)) extra = ' He seems calmer about his situation now.';
  } else if (topicId === 'role' && responseId === 'blunt' && p.ratings.personality.ego >= 15 && rng() < 0.12) {
    pushTradeRequest(s, playerId);
    extra = ' He did not take it well.';
  } else if (topicId === 'trade' && responseId === 'silence' && p.ratings.personality.ego >= 14 && rng() < 0.1) {
    pushTradeRequest(s, playerId);
    extra = ' He did not take it well.';
  }

  const dir = delta > 0 ? 'better' : delta < 0 ? 'worse' : 'about the same';
  return `${p.firstName} ${p.lastName} leaves feeling ${dir} (morale ${delta >= 0 ? '+' : ''}${delta}).${extra}`;
}
