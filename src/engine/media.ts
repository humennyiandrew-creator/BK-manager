// Press conferences: EA FC-style Q&A that moves morale, board confidence and fan hype.
import type { Game, GameState, Player, PressQuestion } from './model';
import { hashString, mulberry32, type Rng } from './rng';
import { addDays, daysBetween } from './schedule';
import { clamp, teamStrengthRank } from './mgmt/market';
import { makePromise, objectiveLabel } from './mgmt/board';

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`;
const userRoster = (s: GameState) => Object.values(s.players).filter((p) => p.teamId === s.userTeamId && !p.retired);

function msg(s: GameState, subject: string, body: string) {
  s.messages.unshift({ id: s.nextId++, date: s.date, from: 'Press Office', subject, body, read: false, kind: 'other' });
}

function currentStreak(s: GameState): number {
  const games = s.games
    .filter((g) => g.result && (g.home === s.userTeamId || g.away === s.userTeamId))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!games.length) return 0;
  let n = 0, sign = 0;
  for (const g of games) {
    const won = g.home === s.userTeamId ? g.result!.home > g.result!.away : g.result!.away > g.result!.home;
    const v = won ? 1 : -1;
    if (sign === 0) sign = v;
    if (v !== sign) break;
    n++;
  }
  return sign * n;
}

function nextUserGame(s: GameState): Game | undefined {
  return s.games.filter((g) => !g.result && (g.home === s.userTeamId || g.away === s.userTeamId)).sort((a, b) => a.date.localeCompare(b.date))[0];
}

function isBigGame(s: GameState, g: Game): boolean {
  if (g.type !== 'regular') return true;
  const opp = g.home === s.userTeamId ? g.away : g.home;
  return teamStrengthRank(s, opp) <= 6;
}

type QType = 'streak' | 'star' | 'injury' | 'rumor' | 'objective' | 'rival';

interface QBuild { type: QType; text: string; choices: { id: string; label: string; tone: 'calm' | 'bold' | 'blunt' | 'deflect' }[] }

function buildStreak(s: GameState): QBuild | null {
  const streak = currentStreak(s);
  if (streak === 0) return null;
  const won = streak > 0;
  return {
    type: 'streak',
    text: won
      ? `You've won ${streak} in a row. What's behind the run?`
      : `The team has now lost ${Math.abs(streak)} straight. What's going wrong?`,
    choices: [
      { id: 'calm', label: won ? "Credit the group's work in practice." : 'Say the group will work through it.', tone: 'calm' },
      { id: 'bold', label: won ? 'Guarantee it continues into the next stretch.' : 'Guarantee a turnaround soon.', tone: 'bold' },
      { id: 'blunt', label: won ? 'Say the league should be on notice.' : "Admit it, this hasn't been good enough.", tone: 'blunt' },
      { id: 'deflect', label: "Keep the focus on the next game only.", tone: 'deflect' },
    ],
  };
}

function buildStar(s: GameState): QBuild | null {
  const roster = userRoster(s).filter((p) => p.season.gp >= 3).sort((a, b) => b.ratings.ovr - a.ratings.ovr);
  const star = roster[0];
  if (!star) return null;
  const struggling = star.morale < 45 || (star.form ?? 0) <= -1.5;
  return {
    type: 'star',
    text: struggling
      ? `${fullName(star)} looks unhappy lately. What's going on with him?`
      : `${fullName(star)} has been excellent recently. How much credit does he deserve?`,
    choices: [
      { id: 'calm', label: 'Say he has the full support of the staff.', tone: 'calm' },
      { id: 'bold', label: `Publicly guarantee ${star.lastName} an expanded role.`, tone: 'bold' },
      { id: 'blunt', label: struggling ? 'Say he needs to be better.' : 'Say he should be in award conversations.', tone: 'blunt' },
      { id: 'deflect', label: 'Turn the question back to the team.', tone: 'deflect' },
    ],
  };
}

function buildInjury(s: GameState): QBuild | null {
  const hurt = userRoster(s).find((p) => p.injury && p.injury.name !== 'Suspension');
  if (!hurt) return null;
  return {
    type: 'injury',
    text: `How concerned are you about ${fullName(hurt)}'s injury?`,
    choices: [
      { id: 'calm', label: 'Say the medical staff is confident in the timeline.', tone: 'calm' },
      { id: 'blunt', label: 'Admit the timeline is uncertain.', tone: 'blunt' },
      { id: 'deflect', label: "Decline to give a specific update.", tone: 'deflect' },
    ],
  };
}

function buildRumor(s: GameState): QBuild {
  const roster = userRoster(s).sort((a, b) => b.ratings.ovr - a.ratings.ovr);
  const target = roster[Math.floor(roster.length / 3)] ?? roster[0];
  return {
    type: 'rumor',
    text: target ? `There's a rumour ${fullName(target)} could be traded. Any truth to it?` : 'There are rumours of roster changes coming. Any truth to it?',
    choices: [
      { id: 'calm', label: 'Say the front office does not comment on speculation.', tone: 'calm' },
      { id: 'blunt', label: 'Shut the rumour down directly.', tone: 'blunt' },
      { id: 'deflect', label: 'Change the subject.', tone: 'deflect' },
    ],
  };
}

function buildObjective(s: GameState): QBuild {
  return {
    type: 'objective',
    text: `The board's stated goal this year is to ${objectiveLabel(s.board.objective).toLowerCase()}. Do you back that publicly?`,
    choices: [
      { id: 'calm', label: 'Say the team is working toward it.', tone: 'calm' },
      { id: 'bold', label: 'Guarantee the board will get it.', tone: 'bold' },
      { id: 'blunt', label: "Say the target may be unrealistic right now.", tone: 'blunt' },
      { id: 'deflect', label: 'Avoid setting expectations.', tone: 'deflect' },
    ],
  };
}

function buildRival(s: GameState, opp: string): QBuild {
  const t = s.teams[opp];
  return {
    type: 'rival',
    text: `You face the ${t.city} ${t.name} next. What do you expect?`,
    choices: [
      { id: 'calm', label: 'Say it will be a tough, competitive game.', tone: 'calm' },
      { id: 'bold', label: `Guarantee a win over ${t.abbr}.`, tone: 'bold' },
      { id: 'blunt', label: `Say ${t.name} are there to be beaten.`, tone: 'blunt' },
      { id: 'deflect', label: 'Say the focus is only on this side of the ball.', tone: 'deflect' },
    ],
  };
}

function buildQuestions(s: GameState, rng: Rng): PressQuestion[] {
  const next = nextUserGame(s);
  const opp = next ? (next.home === s.userTeamId ? next.away : next.home) : undefined;
  const pool: QBuild[] = [];
  const streak = buildStreak(s); if (streak) pool.push(streak);
  const star = buildStar(s); if (star) pool.push(star);
  const injury = buildInjury(s); if (injury) pool.push(injury);
  pool.push(buildRumor(s));
  pool.push(buildObjective(s));
  if (opp) pool.push(buildRival(s, opp));

  const shuffled = [...pool].sort(() => rng() - 0.5);
  const count = clamp(2 + Math.floor(rng() * 2), 2, 3);
  return shuffled.slice(0, Math.min(count, shuffled.length)).map((q) => ({
    id: `press-${q.type}-${s.nextId++}`,
    text: q.text,
    choices: q.choices,
  }));
}

/** Called once per sim day. Builds a presser after a user game day, or the eve of a big game; expires stale pressers. Max ~2/week. */
export function pressDaily(s: GameState, playedToday: Game[]): void {
  const press = s.press ?? (s.press = {});

  if (press.pending && daysBetween(press.pending.date, s.date) >= 3) {
    for (const q of press.pending.questions) {
      if (!press.pending.answered.includes(q.id)) {
        s.finance.hype = clamp((s.finance.hype ?? 50) - 2, 0, 100);
        for (const p of userRoster(s)) p.morale = clamp(p.morale - 1, 0, 100);
      }
    }
    msg(s, 'Press conference: no comment', 'The press conference window closed without full answers. Fans and media note the silence.');
    press.lastDate = press.pending.date;
    press.pending = undefined;
  }

  if (press.pending) return;

  const userPlayedToday = playedToday.some((g) => g.home === s.userTeamId || g.away === s.userTeamId);
  const next = nextUserGame(s);
  const eveOfBigGame = !!next && daysBetween(s.date, next.date) === 1 && isBigGame(s, next);
  if (!userPlayedToday && !eveOfBigGame) return;
  if (press.lastDate && daysBetween(press.lastDate, s.date) < 3) return;

  const rng = mulberry32(hashString(`${s.seed}|press|${s.date}`));
  const questions = buildQuestions(s, rng);
  if (!questions.length) return;
  press.pending = { date: s.date, questions, answered: [] };
  msg(s, 'Press conference: questions waiting', `The media has ${questions.length} question${questions.length > 1 ? 's' : ''} for you ahead of the next game.`);
}

/** Apply the effect of answering one press question. Returns a short outcome line. */
export function answerPress(s: GameState, questionId: string, choiceId: string): string {
  const press = s.press;
  if (!press?.pending) return 'No press conference active.';
  const q = press.pending.questions.find((x) => x.id === questionId);
  if (!q) return 'Question not found.';
  if (press.pending.answered.includes(questionId)) return 'Already answered.';
  const choice = q.choices.find((c) => c.id === choiceId) ?? q.choices[0];
  const type = questionId.split('-')[1] as QType;
  const roster = userRoster(s);
  const f = s.finance;
  f.hype = f.hype ?? 50;

  let outcome = '';
  const bumpHype = (v: number) => { f.hype = clamp(f.hype! + v, 0, 100); };
  const bumpConf = (v: number) => { s.board.confidence = clamp(s.board.confidence + v, 0, 100); };
  const bumpTeamMorale = (v: number) => { for (const p of roster) p.morale = clamp(p.morale + v, 0, 100); };

  switch (type) {
    case 'streak': {
      if (choice.tone === 'calm') { bumpConf(2); outcome = 'A measured answer keeps the board comfortable.'; }
      else if (choice.tone === 'bold') {
        bumpHype(6); bumpConf(2);
        makePromise(s, 'wins');
        outcome = 'A bold guarantee excites the fans — the board will hold you to it.';
      } else if (choice.tone === 'blunt') { bumpHype(3); bumpTeamMorale(-2); outcome = 'A blunt line makes headlines and puts the locker room on edge.'; }
      else { bumpHype(-2); outcome = 'A deflection leaves the media unsatisfied.'; }
      break;
    }
    case 'star': {
      const star = roster.filter((p) => p.season.gp >= 3).sort((a, b) => b.ratings.ovr - a.ratings.ovr)[0];
      if (choice.tone === 'calm') { if (star) star.morale = clamp(star.morale + 3, 0, 100); outcome = 'A supportive answer settles things down.'; }
      else if (choice.tone === 'bold') { if (star) star.morale = clamp(star.morale + 8, 0, 100); bumpHype(4); outcome = 'The public guarantee lifts his morale and the fanbase.'; }
      else if (choice.tone === 'blunt') { if (star) star.morale = clamp(star.morale - 6, 0, 100); bumpConf(2); outcome = 'The board likes the accountability; he does not.'; }
      else { bumpHype(-2); outcome = 'The deflection reads as evasive.'; }
      break;
    }
    case 'injury': {
      if (choice.tone === 'calm') { bumpTeamMorale(2); outcome = 'A confident update reassures the roster.'; }
      else if (choice.tone === 'blunt') { bumpHype(3); bumpTeamMorale(-2); outcome = 'The honesty is appreciated by media, less so by the player.'; }
      else { bumpHype(-2); outcome = 'The non-answer draws follow-up questions.'; }
      break;
    }
    case 'rumor': {
      if (choice.tone === 'calm') { bumpConf(2); outcome = 'A no-comment answer keeps things quiet.'; }
      else if (choice.tone === 'blunt') { bumpHype(3); bumpTeamMorale(-4); outcome = 'Shutting it down makes news either way.'; }
      else { bumpHype(-1); outcome = 'The subject change fools no one.'; }
      break;
    }
    case 'objective': {
      if (choice.tone === 'calm') { bumpConf(2); outcome = 'The board appreciates the alignment.'; }
      else if (choice.tone === 'bold') {
        bumpHype(5); bumpConf(3);
        makePromise(s, s.board.objective === 'title' ? 'title' : 'playoffs');
        outcome = 'A public guarantee raises expectations — the board will hold you to it.';
      } else if (choice.tone === 'blunt') { bumpConf(-3); bumpHype(2); outcome = 'Managing expectations plays well with fans, less so with ownership.'; }
      else { bumpHype(-2); outcome = 'The vague answer satisfies no one.'; }
      break;
    }
    case 'rival': {
      if (choice.tone === 'calm') { bumpHype(2); outcome = 'A respectful answer plays it safe.'; }
      else if (choice.tone === 'bold') { bumpHype(6); bumpConf(1); outcome = 'The guarantee fires up the fanbase.'; }
      else if (choice.tone === 'blunt') { bumpHype(4); bumpTeamMorale(2); outcome = 'The trash talk gets the room fired up.'; }
      else { bumpHype(-1); outcome = 'The non-answer barely registers.'; }
      break;
    }
    default:
      outcome = 'No comment recorded.';
  }

  press.pending.answered.push(questionId);
  if (press.pending.answered.length >= press.pending.questions.length) {
    msg(s, 'Press conference recap', `Press conference wrapped up. ${outcome}`);
    press.lastDate = press.pending.date;
    press.pending = undefined;
  }
  return outcome;
}
