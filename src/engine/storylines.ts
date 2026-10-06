// Multi-step storylines around the user's players. Each story unfolds over weeks: some beats just
// happen (news, form, morale), others put a decision in front of the coach through the events system.
import type { GameEvent, GameState, Player, StoryKind, Storyline } from './model';
import { addDays } from './schedule';
import { hashString, mulberry32 } from './rng';
import { ageOf } from './ratings';
import { isTwoWay, seasonLabel } from './cba';
import { clamp } from './mgmt/market';
import { leadership } from './chemistry';
import { pushNews } from './news';

type Choice = { id: string; label: string; hint: string };
export interface StoryDraft { type: string; title: string; body: string; playerId?: string; meta?: Record<string, string>; choices: Choice[] }

const MAX_ACTIVE = 3;
const fullName = (p: Player) => `${p.firstName} ${p.lastName}`;
const roster = (s: GameState) => Object.values(s.players).filter((p) => p.teamId === s.userTeamId && !p.retired);
const age = (s: GameState, p: Player) => ageOf(p.birthDate, new Date(s.date));
const mpg = (p: Player) => (p.season.gp ? p.season.min / p.season.gp : 0);
const posGroup = (p: Player) => (['PG', 'SG'].includes(p.positions[0]) ? 'g' : p.positions[0] === 'SF' ? 'w' : 'b');
const isMonday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1;

export const STORY_LABEL: Record<StoryKind, string> = {
  'contract-year': 'Contract year', 'unhappy-star': 'Unhappy star', comeback: 'The comeback', mentor: 'Mentor and rookie', 'rookie-wall': 'Rookie wall',
};

const stories = (s: GameState) => (s.stories ??= []);
const active = (s: GameState) => stories(s).filter((x) => !x.done && x.season === s.season);
const has = (s: GameState, kind: StoryKind, pid: string) => stories(s).some((x) => x.kind === kind && x.playerId === pid && x.season === s.season);

function note(s: GameState, st: Storyline, text: string) {
  st.log.push({ date: s.date, text });
}

function start(s: GameState, kind: StoryKind, p: Player, next: string, text: string, otherId?: string): Storyline {
  const st: Storyline = { id: `st${s.nextId++}`, kind, playerId: p.id, otherId, season: s.season, stage: 0, next, log: [] };
  note(s, st, text);
  stories(s).push(st);
  return st;
}

function finish(s: GameState, st: Storyline, outcome: Storyline['outcome'], text: string, headline?: string) {
  st.done = true;
  st.outcome = outcome;
  st.awaiting = false;
  note(s, st, text);
  const p = s.players[st.playerId];
  if (headline && p) pushNews(s, { kind: 'other', playerId: p.id, teamId: p.teamId ?? undefined, tone: outcome === 'good' ? 'good' : outcome === 'bad' ? 'bad' : 'neutral', headline, body: text });
}

// ---------- triggers ----------

function triggers(s: GameState) {
  if (s.phase !== 'regular') return;
  const rng = mulberry32(hashString(`${s.seed}|stories|${s.date}`));
  const team = roster(s);
  const room = () => active(s).length < MAX_ACTIVE;
  const Y = s.seasonYear;

  // The comeback starts the day a long injury begins, so it is never missed.
  for (const p of team) {
    if (p.injury && p.injury.name !== 'Suspension' && p.injury.daysLeft >= 21 && p.ratings.ovr >= 68 && !has(s, 'comeback', p.id) && room()) {
      start(s, 'comeback', p, addDays(s.date, p.injury.daysLeft), `${p.injury.name}: out for about ${p.injury.daysLeft} days.`);
    }
  }
  if (!isMonday(s.date) || !room()) return;

  const unhappy = team.filter((p) => p.ratings.ovr >= 75 && p.morale < 40 && !has(s, 'unhappy-star', p.id)).sort((a, b) => a.morale - b.morale)[0];
  if (unhappy) {
    const st = start(s, 'unhappy-star', unhappy, s.date, `Morale has dropped to ${unhappy.morale}.`);
    st.awaiting = true;
    return;
  }
  if (s.date >= `${Y}-11-20` && !active(s).some((x) => x.kind === 'contract-year') && rng() < 0.35) {
    const next = seasonLabel(Y + 1);
    const p = team.filter((x) => x.ratings.ovr >= 72 && age(s, x) <= 33 && x.contract && !isTwoWay(x) && !x.contract.salaries.some((c) => c.season >= next) && !has(s, 'contract-year', x.id))
      .sort((a, b) => b.ratings.ovr - a.ratings.ovr)[0];
    if (p) {
      start(s, 'contract-year', p, addDays(s.date, 45), 'Playing for his next contract.');
      p.form = clamp((p.form ?? 0) + 0.5, -3, 3);
      p.morale = clamp(p.morale + 3, 0, 100);
      pushNews(s, { kind: 'other', playerId: p.id, teamId: p.teamId ?? undefined, tone: 'neutral', headline: `${fullName(p)} is playing for his next contract`, body: 'A free agent in the summer, and he knows it.' });
      return;
    }
  }
  if (!stories(s).some((x) => x.kind === 'mentor' && x.season === s.season) && rng() < 0.4) {
    const rookies = team.filter((p) => p.yearsPro === 0 && age(s, p) <= 23);
    for (const r of rookies) {
      const vet = team.filter((v) => age(s, v) >= 31 && posGroup(v) === posGroup(r) && leadership(v) >= 0.55).sort((a, b) => leadership(b) - leadership(a))[0];
      if (vet) {
        const st = start(s, 'mentor', r, s.date, `${fullName(vet)} offers to take him under his wing.`, vet.id);
        st.awaiting = true;
        return;
      }
    }
  }
  if (s.date >= `${Y + 1}-01-10` && s.date <= `${Y + 1}-02-25` && rng() < 0.5) {
    const r = team.filter((p) => p.yearsPro === 0 && mpg(p) >= 16 && p.season.gp >= 25 && !p.injury && !has(s, 'rookie-wall', p.id)).sort((a, b) => (b.fatigue ?? 0) - (a.fatigue ?? 0))[0];
    if (r) {
      const st = start(s, 'rookie-wall', r, s.date, 'Heavy legs, a flat jumper and three months of NBA travel.');
      r.form = clamp((r.form ?? 0) - 0.8, -3, 3);
      st.awaiting = true;
      pushNews(s, { kind: 'other', playerId: r.id, teamId: r.teamId ?? undefined, tone: 'bad', headline: `${fullName(r)} hits the rookie wall` });
    }
  }
}

// ---------- automatic beats ----------

function beat(s: GameState, st: Storyline) {
  const p = s.players[st.playerId];
  if (!p || p.teamId !== s.userTeamId) { finish(s, st, 'neutral', 'He is no longer with the club.'); return; }
  switch (st.kind) {
    case 'contract-year':
      if (st.stage === 0) { st.awaiting = true; return; }
      if ((p.form ?? 0) >= 0.3) {
        p.morale = clamp(p.morale + 4, 0, 100);
        finish(s, st, 'good', 'He delivered: a big contract year, and he will be paid for it.', `${fullName(p)} cashes in on a big contract year`);
      } else finish(s, st, 'neutral', 'The contract year came and went quietly.');
      return;
    case 'unhappy-star':
      if (st.stage === 1) {
        if (p.morale >= 50) finish(s, st, 'good', `Peace restored: morale is back to ${p.morale}.`, `${fullName(p)} and the club move on`);
        else st.awaiting = true;
      }
      return;
    case 'comeback':
      if (st.stage === 0) {
        if (p.injury) { st.next = addDays(s.date, Math.max(1, p.injury.daysLeft)); return; }
        st.awaiting = true;
        return;
      }
      if ((p.form ?? 0) >= 0) {
        p.morale = clamp(p.morale + 4, 0, 100);
        finish(s, st, 'good', 'Back to his best.', `${fullName(p)} is back to his best`);
      } else finish(s, st, 'neutral', 'Still finding his rhythm after the layoff.');
      return;
    case 'mentor': {
      const vet = st.otherId ? s.players[st.otherId] : undefined;
      if (!vet || vet.teamId !== s.userTeamId) { finish(s, st, 'neutral', 'The mentor has moved on.'); return; }
      const a = p.ratings.attrs;
      a.offIQ = Math.min(99, a.offIQ + 0.6);
      a.helpD = Math.min(99, a.helpD + 0.3);
      p.ratings.pot = Math.min(99, p.ratings.pot + 0.25);
      st.stage++;
      if (st.stage >= 5) {
        vet.morale = clamp(vet.morale + 4, 0, 100);
        finish(s, st, 'good', `Two months of extra film, early mornings and advice from ${fullName(vet)}.`, `${fullName(p)} credits ${fullName(vet)} for his rookie year`);
      } else {
        note(s, st, `Another two weeks working with ${fullName(vet)}.`);
        st.next = addDays(s.date, 14);
      }
      return;
    }
    case 'rookie-wall':
      if ((p.form ?? 0) >= 0) finish(s, st, 'good', 'He found his legs again.', `${fullName(p)} is through the rookie wall`);
      else finish(s, st, 'bad', 'Still running on empty.');
      return;
  }
}

/** Once per sim day: start new stories, run the beats that are due. */
export function storylinesDaily(s: GameState) {
  if (s.manager.unemployed) return;
  triggers(s);
  for (const st of active(s)) if (!st.awaiting && s.date >= st.next) beat(s, st);
}

// ---------- decisions ----------

/** The next decision a story needs, if no event for it is already out. */
export function storyDraft(s: GameState): StoryDraft | undefined {
  const out = new Set(s.events.filter((e) => !e.resolved && e.meta?.storyId).map((e) => e.meta!.storyId));
  const st = active(s).find((x) => x.awaiting && !out.has(x.id));
  if (!st) return undefined;
  const p = s.players[st.playerId];
  if (!p) { st.awaiting = false; st.done = true; return undefined; }
  const n = fullName(p);
  const meta = { storyId: st.id };
  const base = { type: `story-${st.kind}`, playerId: p.id, meta };
  switch (st.kind) {
    case 'contract-year':
      return { ...base, title: `${n}'s agent calls`, body: `${n} is ${(p.form ?? 0) >= 0.3 ? 'having a big' : 'in a quiet'} contract year. His agent wants to know where we stand before the summer.`, choices: [
        { id: 'talks', label: 'Open extension talks', hint: 'Morale up now; he will expect a fair offer in Contracts' },
        { id: 'wait', label: 'Let him prove it', hint: 'Keeps the pressure on: more upside if he is happy, a sulk if not' },
      ] };
    case 'unhappy-star':
      return st.stage === 0
        ? { ...base, title: `${n} vents to the media`, body: `"I don't know what my role is here." ${n} has gone public with his frustration.`, choices: [
          { id: 'back', label: 'Back him in public', hint: 'Big morale lift, the board raises an eyebrow' },
          { id: 'meet', label: 'Talk it out in private', hint: 'Steadier: works better with a level-headed player' },
          { id: 'fine', label: 'Fine him for the comments', hint: 'He sulks, but the locker room respects the line' },
        ] }
        : { ...base, title: `${n} wants out`, body: `Three weeks on, nothing has changed. ${n}'s camp has asked about a trade.`, choices: [
          { id: 'promise', label: 'Promise him a bigger role', hint: 'Morale lift now, but his minutes must rise within a month' },
          { id: 'shop', label: 'Quietly listen to offers', hint: 'Calms him a little, and the rumours start' },
          { id: 'hold', label: 'He stays and plays', hint: 'Morale and chemistry take a hit' },
        ] };
    case 'comeback':
      return { ...base, title: `${n} is cleared to return`, body: 'The medical staff have signed off. How do we bring him back?', choices: [
        { id: 'ease', label: 'Ease him back in', hint: 'Fresh legs and lower injury risk, slower to find rhythm' },
        { id: 'full', label: 'Straight back into the rotation', hint: 'Faster rhythm, more wear' },
      ] };
    case 'mentor': {
      const vet = st.otherId ? s.players[st.otherId] : undefined;
      return { ...base, title: `A mentor for ${n}?`, body: `${vet ? fullName(vet) : 'A veteran'} has offered to take ${n} under his wing: extra film, early mornings, the little things.`, choices: [
        { id: 'pair', label: 'Pair them up', hint: 'Steady growth for the rookie over two months' },
        { id: 'pass', label: 'Let the rookie find his own way', hint: 'No change' },
      ] };
    }
    case 'rookie-wall':
      return { ...base, title: `${n} has hit the rookie wall`, body: 'His legs look heavy and his shot is flat. Rookies rarely play this many games this hard.', choices: [
        { id: 'rest', label: 'Give him a few days off', hint: 'Fatigue cleared, he bounces back gradually' },
        { id: 'push', label: 'Push through it', hint: 'A rough few weeks, but he learns the grind' },
        { id: 'film', label: 'Film instead of reps', hint: 'Small lift in form and feel for the game' },
      ] };
  }
}

/** Applies a story decision; called by the events system. */
export function applyStoryChoice(s: GameState, ev: GameEvent, choiceId: string): string {
  const st = stories(s).find((x) => x.id === ev.meta?.storyId);
  const p = ev.playerId ? s.players[ev.playerId] : undefined;
  if (!st || !p) return 'No change.';
  st.awaiting = false;
  const n = fullName(p);
  const step = (days: number, text: string) => { st.stage++; st.next = addDays(s.date, days); note(s, st, text); return text; };
  switch (st.kind) {
    case 'contract-year':
      if (choiceId === 'talks') { p.morale = clamp(p.morale + 8, 0, 100); return step(50, `Talks are open. Make ${n} an offer in Contracts before the summer.`); }
      if (p.morale >= 60) { p.form = clamp((p.form ?? 0) + 0.4, -3, 3); return step(50, `${n} takes it as a challenge.`); }
      p.morale = clamp(p.morale - 6, 0, 100);
      return step(50, `${n} feels undervalued.`);
    case 'unhappy-star':
      if (st.stage === 0) {
        if (choiceId === 'back') { p.morale = clamp(p.morale + 10, 0, 100); s.board.confidence = clamp(s.board.confidence - 1, 0, 100); return step(21, `We backed ${n} in public. He appreciated it.`); }
        if (choiceId === 'meet') { p.morale = clamp(p.morale + 4 + Math.round(leadership(p) * 8), 0, 100); return step(21, `A long conversation with ${n}, away from the cameras.`); }
        p.morale = clamp(p.morale - 8, 0, 100);
        const t = s.teams[s.userTeamId];
        t.chemistry = clamp((t.chemistry ?? 55) + 3, 0, 100);
        return step(21, `${n} was fined. The room noticed that nobody is above the team.`);
      }
      if (choiceId === 'promise') {
        p.morale = clamp(p.morale + 10, 0, 100);
        p.minutesPromise = { baselineMpg: mpg(p), checkDate: addDays(s.date, 30), season: s.season };
        finish(s, st, 'neutral', `We promised ${n} a bigger role. His minutes need to climb within a month.`);
        return st.log[st.log.length - 1].text;
      }
      if (choiceId === 'shop') {
        p.morale = clamp(p.morale + 4, 0, 100);
        pushNews(s, { kind: 'trade', playerId: p.id, teamId: p.teamId ?? undefined, tone: 'neutral', headline: `Rumour: ${n} available for the right price` });
        finish(s, st, 'bad', `We are listening to offers for ${n}.`);
        return st.log[st.log.length - 1].text;
      }
      p.morale = clamp(p.morale - 6, 0, 100);
      { const t = s.teams[s.userTeamId]; t.chemistry = clamp((t.chemistry ?? 55) - 4, 0, 100); }
      finish(s, st, 'bad', `${n} stays. Nobody is pretending it is fine.`);
      return st.log[st.log.length - 1].text;
    case 'comeback':
      if (choiceId === 'ease') { p.fatigue = 0; p.form = clamp((p.form ?? 0) - 0.3, -3, 3); return step(14, `${n} is back on a minutes restriction.`); }
      p.fatigue = clamp((p.fatigue ?? 0) + 25, 0, 100);
      p.form = clamp((p.form ?? 0) + 0.3, -3, 3);
      return step(14, `${n} goes straight back into the rotation.`);
    case 'mentor': {
      const vet = st.otherId ? s.players[st.otherId] : undefined;
      if (choiceId === 'pass') { finish(s, st, 'neutral', 'The rookie will find his own way.'); return 'The rookie will find his own way.'; }
      p.morale = clamp(p.morale + 4, 0, 100);
      if (vet) vet.morale = clamp(vet.morale + 4, 0, 100);
      return step(14, `${vet ? fullName(vet) : 'The veteran'} and ${n} are working together.`);
    }
    case 'rookie-wall':
      if (choiceId === 'rest') { p.fatigue = Math.max(0, (p.fatigue ?? 0) - 40); p.morale = clamp(p.morale + 3, 0, 100); p.form = clamp((p.form ?? 0) + 0.6, -3, 3); return step(21, `${n} gets a few days away from the gym.`); }
      if (choiceId === 'push') { p.form = clamp((p.form ?? 0) - 0.4, -3, 3); p.ratings.pot = Math.min(99, p.ratings.pot + 0.5); return step(21, `${n} keeps grinding.`); }
      p.form = clamp((p.form ?? 0) + 0.4, -3, 3);
      p.ratings.attrs.offIQ = Math.min(99, p.ratings.attrs.offIQ + 0.5);
      return step(21, `${n} swaps reps for the film room.`);
  }
}
