// Dynamic decision events (F1 Manager-style): trade requests, incidents, hype, board/media/finance news.
// Deterministic via mulberry32(hashString(...)). One pending user event at a time; continue() pauses for it.
import type { GameEvent, GameState, Player } from './model';
import { hashString, mulberry32 } from './rng';
import { addDays } from './schedule';
import { clamp } from './mgmt/market';
import { ROLE_LABEL } from './mgmt/staff';
import { applyArcChoice, arcEventDraft, pendingArcDecision } from './arcs';
import { applyStoryChoice, storyDraft } from './storylines';

type Rng = () => number;
type Choice = { id: string; label: string; hint: string };
type Draft = { type: string; title: string; body: string; playerId?: string; staffId?: string; meta?: Record<string, string>; choices: Choice[] };
type Candidate = { weight: number; offseasonOk?: boolean; build: (s: GameState, rng: Rng) => Draft | null };

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`;
const pick = <T,>(arr: T[], rng: Rng): T => arr[Math.floor(rng() * arr.length)];
const userRoster = (s: GameState) => Object.values(s.players).filter((p) => p.teamId === s.userTeamId && !p.retired);

function msg(s: GameState, from: string, subject: string, body: string, kind: GameState['messages'][number]['kind'] = 'event', eventId?: string) {
  s.messages.unshift({ id: s.nextId++, date: s.date, from, subject, body, read: false, kind, ...(eventId ? { action: { type: 'event' as const, eventId } } : {}) });
}

export function pendingUserEvent(s: GameState): GameEvent | undefined {
  return s.events.find((e) => !e.resolved && e.teamId === s.userTeamId);
}

function pushEvent(s: GameState, d: Draft): GameEvent {
  const ev: GameEvent = {
    id: `ev${s.nextId++}`, date: s.date, type: d.type, title: d.title, body: d.body,
    teamId: s.userTeamId, playerId: d.playerId, staffId: d.staffId, meta: d.meta, choices: d.choices,
    expires: addDays(s.date, 3),
  };
  s.events.unshift(ev);
  if (s.events.length > 60) s.events.length = 60;
  msg(s, 'Front Office', ev.title, ev.body, 'event', ev.id);
  return ev;
}

function currentStreak(s: GameState): number {
  const games = s.games
    .filter((g) => g.result && (g.home === s.userTeamId || g.away === s.userTeamId))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!games.length) return 0;
  let n = 0;
  let sign = 0;
  for (const g of games) {
    const won = g.home === s.userTeamId ? g.result!.home > g.result!.away : g.result!.away > g.result!.home;
    const s2 = won ? 1 : -1;
    if (sign === 0) sign = s2;
    if (s2 !== sign) break;
    n++;
  }
  return sign * n;
}

// ---------- catalogue ----------

const CATALOGUE: Candidate[] = [
  // 1. trade request from an unhappy player
  {
    weight: 3, offseasonOk: true,
    build: (s) => {
      const p = userRoster(s).filter((x) => x.morale < 35).sort((a, b) => a.morale - b.morale)[0];
      if (!p) return null;
      return {
        type: 'trade-request', playerId: p.id,
        title: `${fullName(p)} requests a trade`,
        body: `${fullName(p)} has told the front office he's unhappy with his role and wants out.`,
        choices: [
          { id: 'minutes', label: 'Promise more minutes', hint: 'Morale rises now — but his minutes must actually climb within a month, or the next drop is worse.' },
          { id: 'shop', label: 'Quietly shop him', hint: 'Explore the trade market; morale improves a little knowing a way out exists.' },
          { id: 'refuse', label: 'Refuse the request', hint: 'Morale drops further. A high-ego player may leak this to the media.' },
        ],
      };
    },
  },
  // 2. locker-room fight
  {
    weight: 2,
    build: (s, rng) => {
      const roster = userRoster(s);
      if (roster.length < 2) return null;
      const p1 = pick(roster, rng);
      const p2 = pick(roster.filter((x) => x.id !== p1.id), rng);
      return {
        type: 'locker-fight', playerId: p1.id, meta: { p2: p2.id },
        title: 'Locker-room fight',
        body: `${fullName(p1)} and ${fullName(p2)} came to blows after practice. The locker room is tense.`,
        choices: [
          { id: 'fine', label: 'Fine both players', hint: 'Cash into the club account; both take a small morale hit.' },
          { id: 'suspend', label: `Suspend ${p1.lastName}`, hint: `${p1.lastName} sits 2 games; the rest of the room settles down.` },
          { id: 'ignore', label: 'Let it blow over', hint: "No discipline — the whole roster's morale takes a hit." },
        ],
      };
    },
  },
  // 3. off-court incident
  {
    weight: 1,
    build: (s, rng) => {
      const roster = userRoster(s);
      if (!roster.length) return null;
      const p = pick(roster, rng);
      return {
        type: 'off-court-incident', playerId: p.id,
        title: `${fullName(p)} involved in an off-court incident`,
        body: `${fullName(p)} was cited in a minor off-court incident. The league is reviewing potential discipline.`,
        choices: [
          { id: 'internal', label: 'Handle it internally', hint: 'A short 1-game suspension; small morale hit.' },
          { id: 'discipline', label: 'Hand down full discipline', hint: 'A longer 4-game suspension, but the board respects the accountability.' },
          { id: 'defend', label: 'Defend him publicly', hint: 'No suspension, but the board is uneasy about the optics.' },
        ],
      };
    },
  },
  // 4. breakout performance hype
  {
    weight: 2,
    build: (s) => {
      const p = userRoster(s).filter((x) => (x.form ?? 0) >= 2 && !x.arc?.revealed).sort((a, b) => (b.form ?? 0) - (a.form ?? 0))[0];
      if (!p) return null;
      return {
        type: 'breakout-hype', playerId: p.id,
        title: `${fullName(p)} is breaking out`,
        body: `${fullName(p)} has been playing well above his rating recently. His camp is testing the waters on his future.`,
        choices: [
          { id: 'extend', label: 'Back him publicly', hint: 'Show faith now — small boost to his long-term potential and morale.' },
          { id: 'wait', label: 'Wait and see', hint: "Stay patient; he's a little frustrated not to hear more." },
        ],
      };
    },
  },
  // 5. injury setback
  {
    weight: 2,
    build: (s, rng) => {
      const cand = userRoster(s).filter((x) => x.injury && x.injury.name !== 'Suspension' && x.injury.daysLeft >= 3);
      if (!cand.length) return null;
      const p = pick(cand, rng);
      return {
        type: 'injury-setback', playerId: p.id,
        title: `${fullName(p)}'s recovery timeline`,
        body: `${fullName(p)} (${p.injury!.name}) is pushing to accelerate his return from injury.`,
        choices: [
          { id: 'rush', label: 'Rush him back', hint: 'Returns sooner, but risks a setback that adds days right back.' },
          { id: 'cautious', label: 'Play it cautious', hint: 'A few extra days out, but a cleaner recovery.' },
        ],
      };
    },
  },
  // 6. contract holdout
  {
    weight: 2, offseasonOk: true,
    build: (s) => {
      const cand = userRoster(s)
        .filter((x) => x.ratings.ovr >= 80 && x.contract && !x.contract.salaries.some((r) => r.season > s.season))
        .sort((a, b) => b.ratings.ovr - a.ratings.ovr);
      const p = cand[0];
      if (!p) return null;
      return {
        type: 'contract-holdout', playerId: p.id,
        title: `${fullName(p)} wants an extension`,
        body: `${fullName(p)} is entering the final year of his deal and wants clarity on his future here.`,
        choices: [
          { id: 'talk', label: 'Open extension talks', hint: 'Signals commitment — his morale rises.' },
          { id: 'refuse', label: 'Refuse to negotiate now', hint: "He's unsettled by the silence; morale drops." },
        ],
      };
    },
  },
  // 7. rival GM poaches staff
  {
    weight: 2, offseasonOk: true,
    build: (s) => {
      const top = s.staff.filter((x) => x.teamId === s.userTeamId).sort((a, b) => b.rating - a.rating)[0];
      if (!top) return null;
      return {
        type: 'staff-poach', staffId: top.id,
        title: `Rival front office eyes ${top.name}`,
        body: `A rival team has approached ${top.name} (${ROLE_LABEL[top.role]}) about a bigger role elsewhere.`,
        choices: [
          { id: 'counter', label: 'Counter-offer', hint: "Raise his salary ~30% to keep him." },
          { id: 'let-go', label: 'Let him walk', hint: 'He leaves; the role opens up for a new hire.' },
        ],
      };
    },
  },
  // 8. owner demands
  {
    weight: 2, offseasonOk: true,
    build: (s) => ({
      type: 'owner-demands',
      title: 'Ownership checks in',
      body: `The board reiterates its expectations: ${s.board.longTerm}`,
      choices: [
        { id: 'accept', label: 'Reaffirm commitment', hint: 'Shows alignment with ownership — confidence rises.' },
        { id: 'pushback', label: 'Push back on the timeline', hint: 'Stand your ground — costs some confidence, protects your plan.' },
      ],
    }),
  },
  // 9. media controversy after a losing streak
  {
    weight: 2,
    build: (s) => {
      const streak = currentStreak(s);
      if (streak > -3) return null;
      return {
        type: 'media-controversy',
        title: 'Media pressure after the skid',
        body: `Local media is asking pointed questions after a ${Math.abs(streak)}-game losing streak.`,
        choices: [
          { id: 'defend', label: 'Defend the players', hint: 'Team morale rises; the board questions your accountability.' },
          { id: 'blame', label: 'Call out the players', hint: 'The board likes the tough stance; team morale takes a hit.' },
        ],
      };
    },
  },
  // 10. fan protest over ticket prices
  {
    weight: 1, offseasonOk: true,
    build: (s) => {
      if (s.finance.ticketPrice < 110) return null;
      return {
        type: 'fan-protest',
        title: 'Fans protest ticket prices',
        body: `A fan group is protesting outside the arena over the $${s.finance.ticketPrice} average ticket price.`,
        choices: [
          { id: 'lower', label: 'Lower prices', hint: 'Attendance and goodwill rise; revenue per seat drops.' },
          { id: 'hold', label: 'Hold firm', hint: 'No change to pricing — fans stay frustrated, board confidence dips.' },
        ],
      };
    },
  },
  // 11. sponsor offer
  {
    weight: 2, offseasonOk: true,
    build: () => ({
      type: 'sponsor-offer',
      title: 'New sponsorship offer',
      body: "A regional brand wants to put its name on the arena concourse.",
      choices: [
        { id: 'cash', label: 'Take the lump sum', hint: 'One-time $4M cash injection now.' },
        { id: 'longterm', label: 'Sign a long-term deal', hint: 'Smaller $1M upfront, plus a recurring monthly bonus.' },
      ],
    }),
  },
  // 12. youth player asks for playing time / G-League
  {
    weight: 1,
    build: (s, rng) => {
      const cand = userRoster(s).filter((x) => x.yearsPro <= 1 && (x.season.gp === 0 || x.season.min / Math.max(1, x.season.gp) < 15));
      if (!cand.length) return null;
      const p = pick(cand, rng);
      return {
        type: 'youth-ask', playerId: p.id,
        title: `${fullName(p)} wants more run`,
        body: `${fullName(p)} feels ready for a bigger role and has asked about G-League reps or a path to the rotation.`,
        choices: [
          { id: 'gleague', label: 'Send him down for reps', hint: "Small development boost; he's frustrated short-term." },
          { id: 'promise', label: 'Promise a path to more minutes', hint: 'Morale rises now.' },
        ],
      };
    },
  },
  // 13. veteran mentor
  {
    weight: 1, offseasonOk: true,
    build: (s, rng) => {
      const roster = userRoster(s);
      const vets = roster.filter((x) => x.yearsPro >= 8);
      const young = roster.filter((x) => x.yearsPro <= 2);
      if (!vets.length || !young.length) return null;
      const v = pick(vets, rng);
      const youngOthers = young.filter((x) => x.id !== v.id);
      if (!youngOthers.length) return null;
      const y = pick(youngOthers, rng);
      return {
        type: 'veteran-mentor', playerId: v.id, meta: { mentee: y.id },
        title: `${fullName(v)} offers to mentor ${fullName(y)}`,
        body: `${fullName(v)} has taken an interest in developing ${fullName(y)}'s game.`,
        choices: [
          { id: 'pair', label: 'Encourage the pairing', hint: `Small development boost for ${fullName(y)}.` },
          { id: 'skip', label: 'Leave it be', hint: 'No change.' },
        ],
      };
    },
  },
  // 14. illness outbreak
  {
    weight: 1,
    build: (s, rng) => {
      const healthy = userRoster(s).filter((x) => !x.injury);
      if (healthy.length < 2) return null;
      const shuffled = [...healthy].sort(() => rng() - 0.5).slice(0, rng() < 0.5 ? 2 : 3);
      return {
        type: 'illness-outbreak', playerId: shuffled[0].id, meta: { ids: shuffled.map((x) => x.id).join(',') },
        title: 'Illness moves through the locker room',
        body: `${shuffled.length} players are dealing with an illness going around the team.`,
        choices: [
          { id: 'rest', label: 'Rest them fully', hint: 'A couple of extra days out, but morale holds up.' },
          { id: 'push', label: 'Push them to play through it', hint: "Back sooner, but the roster isn't thrilled about the risk." },
        ],
      };
    },
  },
  // 15. charity event
  {
    weight: 1, offseasonOk: true,
    build: () => ({
      type: 'charity-event',
      title: 'Charity event proposal',
      body: 'The community relations team has proposed a team charity event.',
      choices: [
        { id: 'host', label: 'Host the event', hint: 'Costs the club some cash; morale and board confidence rise.' },
        { id: 'skip', label: 'Pass this time', hint: 'No cost, no benefit.' },
      ],
    }),
  },
];

function triggerFrom(s: GameState, pool: Candidate[], rng: Rng): void {
  const built = pool.map((c) => ({ c, d: c.build(s, rng) })).filter((x): x is { c: Candidate; d: Draft } => !!x.d);
  if (!built.length) return;
  const total = built.reduce((sum, x) => sum + x.c.weight, 0);
  let r = rng() * total;
  const chosen = built.find((x) => (r -= x.c.weight) <= 0) ?? built[0];
  pushEvent(s, chosen.d);
}

// ---------- league-wide flavour news (AI teams, message only) ----------

function leagueNews(s: GameState, rng: Rng): void {
  const others = Object.values(s.teams).filter((t) => t.id !== s.userTeamId);
  if (!others.length) return;
  const t = pick(others, rng);
  const roster = Object.values(s.players).filter((x) => x.teamId === t.id);
  const p = roster.length ? pick(roster, rng) : undefined;
  const templates = [
    `Reports suggest the ${t.city} ${t.name} are exploring the trade market.`,
    p ? `${fullName(p)} named the ${t.abbr} Player of the Month by local media.` : `The ${t.name} are drawing praise for their player development.`,
    `Executives around the league are said to be watching ${t.name}'s cap situation closely.`,
    `The ${t.city} ${t.name} front office denies rumors of a front-office shake-up.`,
  ];
  msg(s, 'League Office', `Around the league: ${t.abbr}`, pick(templates, rng), 'league');
}

// ---------- effects ----------

function applyEffect(s: GameState, ev: GameEvent, choiceId: string): string {
  const p = ev.playerId ? s.players[ev.playerId] : undefined;
  switch (ev.type) {
    case 'trade-request': {
      if (!p) return 'No change.';
      if (choiceId === 'minutes') {
        p.morale = clamp(p.morale + 12, 0, 100);
        p.minutesPromise = { baselineMpg: p.season.gp ? p.season.min / p.season.gp : 0, checkDate: addDays(s.date, 30), season: s.season };
        return `${fullName(p)} settles down for now. We've promised him a bigger role — his minutes need to climb within a month.`;
      }
      if (choiceId === 'shop') {
        p.morale = clamp(p.morale + 5, 0, 100);
        return `We've quietly put ${fullName(p)} on the trade market. He appreciates knowing a way out exists.`;
      }
      p.morale = clamp(p.morale - 10, 0, 100);
      if (p.ratings.personality.ego >= 15) {
        s.board.confidence = clamp(s.board.confidence - 3, 0, 100);
        return `We refused the request. ${fullName(p)}'s camp leaked the story to the media — the board isn't pleased.`;
      }
      return `We refused the request. ${fullName(p)} is frustrated but staying quiet about it.`;
    }
    case 'locker-fight': {
      const p1 = p, p2 = ev.meta?.p2 ? s.players[ev.meta.p2] : undefined;
      if (!p1) return 'No change.';
      if (choiceId === 'fine') {
        p1.morale = clamp(p1.morale - 4, 0, 100);
        if (p2) p2.morale = clamp(p2.morale - 4, 0, 100);
        s.finance.cash += 250_000;
        return 'Both players fined. $250K added to the club account.';
      }
      if (choiceId === 'suspend') {
        if (!p1.injury) p1.injury = { name: 'Suspension', daysLeft: 2 };
        if (p2) p2.morale = clamp(p2.morale + 3, 0, 100);
        return `${fullName(p1)} suspended two games. The rest of the roster settles down.`;
      }
      for (const x of userRoster(s)) x.morale = clamp(x.morale - 3, 0, 100);
      return 'No discipline handed out. Morale dips across the roster.';
    }
    case 'off-court-incident': {
      if (!p) return 'No change.';
      if (choiceId === 'internal') {
        p.injury = { name: 'Suspension', daysLeft: 1 };
        p.morale = clamp(p.morale - 3, 0, 100);
        return `${fullName(p)} suspended 1 game.`;
      }
      if (choiceId === 'discipline') {
        p.injury = { name: 'Suspension', daysLeft: 4 };
        s.board.confidence = clamp(s.board.confidence + 3, 0, 100);
        return `${fullName(p)} suspended 4 games. The board respects the firm response.`;
      }
      s.board.confidence = clamp(s.board.confidence - 4, 0, 100);
      p.morale = clamp(p.morale + 3, 0, 100);
      return `We defended ${fullName(p)} publicly. The board isn't thrilled with the optics.`;
    }
    case 'breakout-hype': {
      if (!p) return 'No change.';
      if (choiceId === 'extend') {
        p.ratings.pot = Math.min(99, p.ratings.pot + 1);
        p.morale = clamp(p.morale + 5, 0, 100);
        return `${fullName(p)} feels the organization's confidence and is more locked in.`;
      }
      p.morale = clamp(p.morale - 2, 0, 100);
      return `We stayed patient. ${fullName(p)} is a little frustrated not to hear more.`;
    }
    case 'injury-setback': {
      if (!p || !p.injury) return 'No change.';
      if (choiceId === 'rush') {
        const rng = mulberry32(hashString(`${s.seed}|injrush|${ev.id}`));
        p.injury.daysLeft = Math.max(1, Math.round(p.injury.daysLeft * 0.6));
        if (rng() < 0.3) {
          p.injury.daysLeft += Math.round(4 + rng() * 6);
          return `${fullName(p)} rushed back and suffered a setback — extra time added to his recovery.`;
        }
        return `${fullName(p)} is on an accelerated recovery plan.`;
      }
      p.injury.daysLeft += 3;
      p.morale = clamp(p.morale + 2, 0, 100);
      return `${fullName(p)} is taking it slow — a few extra days, but a cleaner recovery.`;
    }
    case 'contract-holdout': {
      if (!p) return 'No change.';
      if (choiceId === 'talk') {
        p.morale = clamp(p.morale + 8, 0, 100);
        return `${fullName(p)} appreciates the open conversation about his future.`;
      }
      p.morale = clamp(p.morale - 10, 0, 100);
      return `${fullName(p)} is unsettled by our silence on a new deal.`;
    }
    case 'staff-poach': {
      const st = ev.staffId ? s.staff.find((x) => x.id === ev.staffId) : undefined;
      if (!st) return 'No change.';
      if (choiceId === 'counter') {
        const raise = Math.round((st.salary * 0.3) / 10_000) * 10_000;
        st.salary += raise;
        s.finance.cash -= raise;
        s.finance.expense.staff += raise;
        return `${st.name} re-signs at $${(st.salary / 1e6).toFixed(1)}M/yr.`;
      }
      st.teamId = null;
      return `${st.name} has left for the rival offer. The role is vacant.`;
    }
    case 'owner-demands': {
      if (choiceId === 'accept') {
        s.board.confidence = clamp(s.board.confidence + 3, 0, 100);
        return 'The board appreciates the alignment.';
      }
      s.board.confidence = clamp(s.board.confidence - 4, 0, 100);
      return 'The board notes your pushback but respects the conviction.';
    }
    case 'media-controversy': {
      const roster = userRoster(s);
      if (choiceId === 'defend') {
        for (const x of roster) x.morale = clamp(x.morale + 4, 0, 100);
        s.board.confidence = clamp(s.board.confidence - 3, 0, 100);
        return 'The roster appreciates the public support.';
      }
      for (const x of roster) x.morale = clamp(x.morale - 4, 0, 100);
      s.board.confidence = clamp(s.board.confidence + 3, 0, 100);
      return 'The board likes the accountability — the roster is stung by the public criticism.';
    }
    case 'fan-protest': {
      if (choiceId === 'lower') {
        s.finance.ticketPrice = Math.max(40, s.finance.ticketPrice - 10);
        return `Ticket price cut to $${s.finance.ticketPrice}. Fans are pleased.`;
      }
      s.board.confidence = clamp(s.board.confidence - 2, 0, 100);
      return 'Prices stay put. Fan frustration lingers.';
    }
    case 'sponsor-offer': {
      if (choiceId === 'cash') {
        s.finance.cash += 4_000_000;
        return 'Received a $4M lump-sum sponsorship payment.';
      }
      s.finance.cash += 1_000_000;
      s.finance.sponsorBonus = (s.finance.sponsorBonus ?? 0) + 300_000;
      return 'Signed a long-term sponsorship deal — $300K/month going forward.';
    }
    case 'youth-ask': {
      if (!p) return 'No change.';
      if (choiceId === 'gleague') {
        p.ratings.pot = Math.min(99, p.ratings.pot + 1);
        p.morale = clamp(p.morale - 2, 0, 100);
        return `${fullName(p)} is getting reps and developing, even if he'd rather be with the big club.`;
      }
      p.morale = clamp(p.morale + 5, 0, 100);
      return `${fullName(p)} appreciates the vote of confidence.`;
    }
    case 'veteran-mentor': {
      const v = p, y = ev.meta?.mentee ? s.players[ev.meta.mentee] : undefined;
      if (!v || !y) return 'No change.';
      if (choiceId === 'pair') {
        y.ratings.pot = Math.min(99, y.ratings.pot + 1);
        v.morale = clamp(v.morale + 3, 0, 100);
        return `${fullName(y)} benefits from ${fullName(v)}'s mentorship.`;
      }
      return 'The mentorship never really got going.';
    }
    case 'illness-outbreak': {
      const ids = ev.meta?.ids?.split(',') ?? [];
      const days = choiceId === 'push' ? 1 : 2;
      for (const id of ids) {
        const x = s.players[id];
        if (x && !x.injury) x.injury = { name: 'Illness', daysLeft: days };
      }
      if (choiceId === 'push') {
        for (const x of userRoster(s)) x.morale = clamp(x.morale - 2, 0, 100);
        return "Affected players push through — back sooner, but the roster isn't thrilled.";
      }
      return 'Affected players rest up fully before returning.';
    }
    case 'arc-breakout':
    case 'arc-slump':
      return applyArcChoice(s, ev, choiceId);
    case 'story-contract-year':
    case 'story-unhappy-star':
    case 'story-comeback':
    case 'story-mentor':
    case 'story-rookie-wall':
      return applyStoryChoice(s, ev, choiceId);
    case 'charity-event': {
      if (choiceId === 'host') {
        s.finance.cash -= 150_000;
        for (const x of userRoster(s)) x.morale = clamp(x.morale + 4, 0, 100);
        s.board.confidence = clamp(s.board.confidence + 3, 0, 100);
        return 'The event is a hit — team morale and board confidence rise.';
      }
      return 'We passed on the event this time.';
    }
    default:
      return 'No change.';
  }
}

export function resolveEvent(s: GameState, eventId: string, choiceId: string, auto = false): string | null {
  const ev = s.events.find((e) => e.id === eventId);
  if (!ev) return 'Event not found';
  if (ev.resolved) return 'Event already resolved';
  const choice = ev.choices.find((c) => c.id === choiceId) ?? ev.choices[0];
  const outcome = applyEffect(s, ev, choice.id);
  ev.resolved = { choiceId: choice.id, outcome };
  msg(s, 'Front Office', `${ev.title} — resolved`, auto ? `(Expired without a decision) ${outcome}` : outcome, 'event', ev.id);
  return null;
}

function checkMinutesPromises(s: GameState): void {
  for (const p of userRoster(s)) {
    const mp = p.minutesPromise;
    if (!mp) continue;
    if (mp.season !== s.season) { p.minutesPromise = undefined; continue; }
    if (s.date < mp.checkDate) continue;
    const mpg = p.season.gp ? p.season.min / p.season.gp : 0;
    if (mpg >= mp.baselineMpg + 1) {
      p.morale = clamp(p.morale + 4, 0, 100);
      msg(s, 'Front Office', `${fullName(p)}'s minutes are up`, `We kept our word — ${fullName(p)}'s role has grown as promised.`, 'event');
    } else {
      p.morale = clamp(p.morale - 14, 0, 100);
      msg(s, 'Front Office', `${fullName(p)} feels betrayed`, `We promised ${fullName(p)} more minutes, but his role hasn't changed. Trust is damaged.`, 'event');
    }
    p.minutesPromise = undefined;
  }
}

function offseasonEventCheck(s: GameState): void {
  const stage = s.offseason?.stage ?? (s.careerOver ? 'career-over' : 'review');
  if (s.offseasonEventStage === stage) return;
  s.offseasonEventStage = stage;
  if (pendingUserEvent(s)) return;
  const rng = mulberry32(hashString(`${s.seed}|offseasonevent|${s.season}|${stage}`));
  if (rng() >= 0.5) return;
  triggerFrom(s, CATALOGUE.filter((c) => c.offseasonOk), rng);
}

/** Called once per sim day. Rolls dynamic events, expires stale ones, and settles minutes promises. */
export function eventsDaily(s: GameState): void {
  if (!s.events) s.events = [];
  for (const ev of [...s.events]) {
    if (!ev.resolved && s.date >= ev.expires) resolveEvent(s, ev.id, ev.choices[0]?.id ?? '', true);
  }
  checkMinutesPromises(s);

  if (s.phase === 'offseason') { offseasonEventCheck(s); return; }

  // A breakout or collapse on our roster is the story of the week: it jumps the queue.
  const arcPlayer = !pendingUserEvent(s) ? pendingArcDecision(s) : undefined;
  const story = !arcPlayer && !pendingUserEvent(s) ? storyDraft(s) : undefined;
  if (arcPlayer) pushEvent(s, arcEventDraft(s, arcPlayer));
  else if (story) pushEvent(s, story);
  else if (!pendingUserEvent(s)) {
    const rng = mulberry32(hashString(`${s.seed}|event|${s.date}`));
    if (rng() < 1 / 9) triggerFrom(s, CATALOGUE, rng);
  }
  const rng2 = mulberry32(hashString(`${s.seed}|leaguenews|${s.date}`));
  if (rng2() < 1 / 25) leagueNews(s, rng2);
}
