import { useMemo, type CSSProperties } from 'react';
import Panel from '../components/Panel';
import BkImage from '../components/BkImage';
import ArcBadge from '../components/hub/ArcBadge';
import ObjectiveList from '../components/hub/ObjectiveList';
import NewsFeed from '../components/hub/NewsFeed';
import PowerRankings from '../components/hub/PowerRankings';
import AwardRaces from '../components/hub/AwardRaces';
import ActionItems from '../components/hub/ActionItems';
import { onConcrete } from '../components/shell/teamColors';
import { useGameState } from '../store/useGame';
import { useUI } from '../store/useUI';
import { useTransfersNav } from '../store/useTransfersNav';
import { formatDate, formatMoneyShort } from '../format';
import { coachInsights } from '../insights';
import {
  userTeam, opponentOf, daysUntil, lastMeeting, lastUserGame, nextUserGame, topPlayers, rotationTop8Avg
} from '../selectors';
import type { Game, GameState, Player, SeasonRecord, Session } from '../../engine/model';
import { standings } from '../../engine/season';
import { offseasonStageLabel } from '../../engine/offseason';
import { leagueOf } from '../../engine/leagues';
import { objectiveLabel } from '../../engine/mgmt/board';
import { addDays } from '../../engine/schedule';
import { sessionOn } from '../../engine/training';
import { cupLabel, momentOn } from '../../engine/calendar';
import { TIER_LABEL, clubRival, tierOf } from '../../engine/rivalries';
import { formChip } from './RosterScreen';
import styles from './HomeScreen.module.css';

// ---------- the week ahead + club numbers ----------

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SESSION: Record<Session, string> = { high: 'Hard practice', light: 'Light practice', shootaround: 'Shootaround', film: 'Film session', rest: 'Rest day' };

function Meter({ label, value, text, tone }: { label: string; value?: number; text: string; tone?: 'good' | 'bad' }) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={`${styles.kpiValue} numeral ${tone === 'good' ? styles.pos : tone === 'bad' ? styles.neg : ''}`}>{text}</span>
      {value != null && <span className={styles.kpiBar}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></span>}
    </div>
  );
}

function WeekStrip({ s }: { s: GameState }) {
  const setTab = useUI((u) => u.setTab);
  const team = userTeam(s);
  const chem = team.chemistry ?? 55;
  const days = Array.from({ length: 7 }, (_, i) => addDays(s.date, i));
  const gameOn = (d: string) => s.games.find((g) => g.date === d && (g.home === team.id || g.away === team.id));
  return (
    <section className={styles.week}>
      {s.phase === 'offseason' ? (
        <div className={styles.weekOff}>
          <span className={styles.weekOffLabel}>Offseason</span>
          <span className={styles.weekOffStage}>{offseasonStageLabel(s)}</span>
        </div>
      ) : (
        <div className={styles.days}>
          {days.map((d, i) => {
            const g = gameOn(d);
            const opp = g ? s.teams[g.home === team.id ? g.away : g.home] : null;
            const session = !g ? sessionOn(s, team.id, d) : null;
            const moment = momentOn(s, d);
            return (
              <button key={d} type="button" className={`${styles.day} ${i === 0 ? styles.today : ''} ${g ? styles.gameDay : ''}`} onClick={() => setTab(g ? 'calendar' : 'training')}>
                <span className={styles.dow}>{i === 0 ? 'Today' : DOW[new Date(`${d}T00:00:00Z`).getUTCDay()]}</span>
                <span className={`${styles.dnum} numeral`}>{Number(d.slice(8))}</span>
                {opp ? (
                  <span className={styles.dayGame}>
                    <BkImage path={opp.logo} alt={opp.abbr} className={styles.dayLogo} />
                    {g!.home === team.id ? 'vs' : 'at'} {opp.abbr}
                    {g!.cup && <span className={styles.cupTag}>Cup</span>}
                  </span>
                ) : moment && moment !== 'Cup night' ? <span className={styles.moment}>{moment}</span>
                  : <span className={`${styles.session} ${session === 'rest' ? styles.rest : session === 'high' ? styles.hard : ''}`}>{SESSION[session!]}</span>}
              </button>
            );
          })}
        </div>
      )}
      <div className={styles.kpis}>
        <Meter label="Cash" text={formatMoneyShort(s.finance.cash)} tone={s.finance.cash < 0 ? 'bad' : undefined} />
        <Meter label="Board" text={`${Math.round(s.board.confidence)}`} value={s.board.confidence} tone={s.board.confidence < 35 ? 'bad' : undefined} />
        <Meter label="Fans" text={`${Math.round(s.finance.hype ?? 50)}`} value={s.finance.hype ?? 50} />
        <Meter label="Chemistry" text={`${Math.round(chem)}`} value={chem} tone={chem < 40 ? 'bad' : chem >= 70 ? 'good' : undefined} />
      </div>
    </section>
  );
}

// ---------- next match ----------

function normCdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/** Pre-game prediction from top-8 strength and home court, same model the live win-probability uses. */
function preGameOdds(s: GameState, g: Game): number {
  const us = s.teams[s.userTeamId], them = opponentOf(s, g);
  const edge = (rotationTop8Avg(us, s.players) - rotationTop8Avg(them, s.players)) * 1.1 + (g.home === us.id ? 2 : -2);
  return normCdf(edge / (leagueOf(us.league).id === 'NBA' ? 12.5 : 10.5));
}

function gameLabel(s: GameState, g: Game): string {
  const cup = cupLabel(g);
  if (cup) return cup;
  if (g.type === 'regular') return `${leagueOf(g.comp ?? s.teams[g.home].league).short} regular season`;
  const se = s.series.find((x) => x.id === g.seriesId);
  if (!se) return g.type === 'playin' ? 'Play-in' : 'Playoffs';
  const us = s.userTeamId;
  const w = se.high === us ? se.winsHigh : se.winsLow, l = se.high === us ? se.winsLow : se.winsHigh;
  const head = g.type === 'playin' ? 'Play-in' : `Playoffs, round ${se.round}, game ${se.winsHigh + se.winsLow + 1}`;
  return se.bestOf > 1 ? `${head} (series ${w}–${l})` : head;
}

function NextMatch({ s, g }: { s: GameState; g: Game }) {
  const setTab = useUI((u) => u.setTab);
  const openPlayer = useUI((u) => u.openPlayer);
  const us = userTeam(s), opp = opponentOf(s, g);
  const rec = (id: string) => standings(s, undefined, s.teams[id].league ?? 'NBA').find((r) => r.teamId === id);
  const d = daysUntil(s, g.date);
  const odds = Math.round(preGameOdds(s, g) * 100);
  const last = lastMeeting(s, opp.id);
  const objectives = s.matchObjectives?.gameId === g.id ? s.matchObjectives.list : null;
  const star = (id: string) => topPlayers(s, id, 6).find((p) => !p.injury);
  const home = g.home === us.id;
  const rival = clubRival(s, opp.id);
  const side = (team: typeof us, right: boolean) => {
    const r = rec(team.id), p = star(team.id);
    return (
      <div className={`${styles.mSide} ${right ? styles.mRight : ''}`} style={{ '--side': onConcrete(team.colors.primary, team.colors.secondary) } as CSSProperties}>
        <BkImage path={team.logo} alt={team.abbr} className={styles.mLogo} />
        <div className={styles.mTeam}>
          <span className={styles.mCity}>{team.city}</span>
          <span className={`${styles.mName} wordmark`}>{team.name}</span>
          <span className={styles.mRec}>{r ? `${r.w}–${r.l}` : '0–0'}</span>
        </div>
        {p && (
          <button type="button" className={styles.mStar} onClick={() => openPlayer(p.id)} title={`${p.firstName} ${p.lastName}`}>
            <BkImage path={p.face} alt={p.lastName} className={styles.mFace} />
            <span className={styles.mStarText}>
              <span className={styles.mStarName}>{p.lastName}</span>
              <span className={`${styles.mStarOvr} numeral`}>{p.ratings.ovr}</span>
            </span>
          </button>
        )}
      </div>
    );
  };
  return (
    <section className={styles.match}>
      <header className={styles.mHead}>
        <span className={styles.mComp}>
          {gameLabel(s, g)}
          {rival && <span className={`${styles.rivalTag} ${styles[`rv_${tierOf(rival.heat)}`]}`}>{TIER_LABEL[tierOf(rival.heat)]}, {rival.season.w}–{rival.season.l} this season</span>}
        </span>
        <span className={styles.mWhen}>{home ? 'Home' : 'Away'}, {formatDate(g.date)}</span>
      </header>
      <div className={styles.mMain}>
        {side(us, false)}
        <div className={styles.mCenter}>
          <span className={styles.clock}>
            <span className={`${styles.clockNum} led`}>{d <= 0 ? '00' : String(d).padStart(2, '0')}</span>
            <span className={styles.clockLabel}>{d <= 0 ? 'Tip-off today' : d === 1 ? 'day to tip-off' : 'days to tip-off'}</span>
          </span>
          {last?.result && (() => { const [a, b] = last.home === us.id ? [last.result.home, last.result.away] : [last.result.away, last.result.home]; return <span className={styles.mLast}>Last meeting: {a > b ? 'won' : 'lost'} {a}–{b}</span>; })()}
        </div>
        {side(opp, true)}
      </div>
      <div className={styles.odds}>
        <span className={styles.oddsNum}>{odds}%</span>
        <span className={styles.oddsBar}>
          <span style={{ width: `${odds}%`, background: onConcrete(us.colors.primary, us.colors.secondary) }} />
          <span style={{ width: `${100 - odds}%`, background: onConcrete(opp.colors.primary, opp.colors.secondary) }} />
        </span>
        <span className={styles.oddsNum}>{100 - odds}%</span>
        <span className={styles.oddsLabel}>Win chance</span>
      </div>
      <footer className={styles.mFoot}>
        <div className={styles.mObjectives}>
          <span className={styles.subhead}>Sponsor objectives</span>
          {objectives ? <ObjectiveList list={objectives} compact /> : <span className={styles.muted}>Partners set their goals a few days before tip-off.</span>}
        </div>
        <div className={styles.mActions}>
          <button type="button" className={styles.btnChalk} onClick={() => setTab('training')}>{s.prep && s.prep.gameId === g.id && !s.prep.prepared ? 'Set the game plan' : 'Game plan'}</button>
          <button type="button" className={styles.btn} onClick={() => setTab('playbook')}>Tactics</button>
          <button type="button" className={styles.btn} onClick={() => setTab('roster')}>Lineup</button>
        </div>
      </footer>
    </section>
  );
}

// ---------- season status ----------

function objectiveOnTrack(s: GameState, pos: number, teams: number): boolean | null {
  const o = s.board.objective;
  const needed = leagueOf(s.teams[s.userTeamId].league).id === 'NBA'
    ? { title: 2, finals: 2, confFinals: 3, playoffs: 6, playin: 10, develop: 15 }[o]
    : { title: 2, finals: 3, confFinals: 4, playoffs: 6, playin: 10, develop: teams }[o];
  return pos ? pos <= needed : null;
}

const ordinal = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');

function SeasonStatus({ s }: { s: GameState }) {
  const setTab = useUI((u) => u.setTab);
  const team = userTeam(s);
  const nba = leagueOf(team.league).id === 'NBA';
  const table = standings(s, nba ? team.conference : undefined);
  const row = table.find((r) => r.teamId === team.id);
  const played = row ? row.w + row.l : 0;
  const pos = row && played > 0 ? table.indexOf(row) + 1 : 0;
  const onTrack = objectiveOnTrack(s, pos, table.length);
  const idx = row ? table.indexOf(row) : 0;
  const from = Math.max(0, Math.min(table.length - 7, idx - 3));
  const near = table.slice(from, from + 7);
  const lead = table[0];
  const gb = (r: typeof lead) => ((lead.w - r.w) + (r.l - lead.l)) / 2;
  return (
    <section className={styles.status}>
      <div className={styles.stTop}>
        <span className={styles.stPos}>
          <span className="numeral">{pos || '–'}</span>
          {pos > 0 && <span className={styles.stOrd}>{ordinal(pos)}</span>}
        </span>
        <div className={styles.stInfo}>
          <span className={styles.stLabel}>{nba ? `${team.conference}ern Conference` : leagueOf(team.league).name}</span>
          <span className={`${styles.stRecord} numeral`}>{row ? `${row.w}–${row.l}` : '0–0'}</span>
          {row && played > 0 && (
            <span className={styles.stMeta}>
              {row.streak !== 0 && <span className={row.streak > 0 ? styles.pos : styles.neg}>{row.streak > 0 ? 'Won' : 'Lost'} {Math.abs(row.streak)}</span>}
              <span>Last ten {row.last10[0]}–{row.last10[1]}</span>
              <span>Net {((row.pf - row.pa) / played) >= 0 ? '+' : ''}{((row.pf - row.pa) / played).toFixed(1)}</span>
            </span>
          )}
        </div>
      </div>
      <div className={styles.stObjective}>
        <span className={styles.stObjLabel}>Board wants</span>
        <span className={styles.stObjText}>{objectiveLabel(s.board.objective)}</span>
        {onTrack != null && s.phase !== 'offseason' && <span className={onTrack ? styles.onTrack : styles.offTrack}>{onTrack ? 'On track' : 'Off pace'}</span>}
      </div>
      <button type="button" className={styles.table} onClick={() => setTab('standings')}>
        {near.map((r) => {
          const t = s.teams[r.teamId];
          const i = table.indexOf(r);
          return (
            <span key={r.teamId} className={`${styles.tRow} ${r.teamId === team.id ? styles.tMine : ''} ${nba && (i === 5 || i === 9) ? styles.tCut : ''}`}>
              <span className={styles.tPos}>{i + 1}</span>
              <BkImage path={t.logo} alt={t.abbr} className={styles.tLogo} />
              <span className={styles.tName}>{t.name}</span>
              <span className={styles.tRec}>{r.w}–{r.l}</span>
              <span className={styles.tGb}>{i === 0 ? '' : gb(r) ? gb(r).toFixed(1) : '–'}</span>
            </span>
          );
        })}
      </button>
    </section>
  );
}

// ---------- rotation ----------

function SquadStatus({ s }: { s: GameState }) {
  const openPlayer = useUI((u) => u.openPlayer);
  const team = userTeam(s);
  const ps = team.rotation.slice(0, 8).map((id) => s.players[id]).filter(Boolean) as Player[];
  return (
    <div className={styles.squad}>
      {ps.map((p, i) => {
        const f = formChip(p.form);
        const fat = p.fatigue ?? 0;
        return (
          <button key={p.id} type="button" className={`${styles.sqRow} ${i === 5 ? styles.sqBench : ''}`} onClick={() => openPlayer(p.id)}>
            <span className={`${styles.sqNum} numeral`}>{p.jersey}</span>
            <BkImage path={p.face} alt={p.lastName} className={styles.sqFace} />
            <span className={styles.sqWho}>
              <span className={styles.sqName}>{p.firstName[0]}. {p.lastName}</span>
              <span className={styles.sqTags}>
                {i < 5 ? p.positions[0] : 'Bench'}
                {p.injury ? <span className={styles.sqInj}>{p.injury.name}, {p.injury.daysLeft}d</span> : <ArcBadge arc={p.arc} season={s.season} />}
              </span>
            </span>
            <span className={`${styles.sqForm} ${styles[f.variant]}`} title="Form">{f.icon}</span>
            <span className={styles.sqFat} title={`Fatigue ${Math.round(fat)}`}><span style={{ width: `${fat}%`, background: fat >= 70 ? 'var(--loss)' : fat >= 45 ? 'var(--warn)' : 'var(--chalk-3)' }} /></span>
            <span className={styles.sqMorale} style={{ background: p.morale >= 65 ? 'var(--win)' : p.morale >= 40 ? 'var(--warn)' : 'var(--loss)' }} title={`Morale ${p.morale}`} />
            <span className={`${styles.sqOvr} numeral`}>{p.ratings.ovr}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- last result ----------

function LastResult({ s }: { s: GameState }) {
  const g = lastUserGame(s);
  const openPlayer = useUI((u) => u.openPlayer);
  if (!g?.result) return <div className={styles.muted}>No games played yet this season.</div>;
  const us = g.home === s.userTeamId;
  const opp = opponentOf(s, g);
  const mine = us ? g.result.home : g.result.away, theirs = us ? g.result.away : g.result.home;
  const won = mine > theirs;
  const box = g.result.box ? (us ? g.result.box.home : g.result.box.away) : [];
  const tops = [...box].sort((a, b) => b.pts - a.pts).slice(0, 3);
  const log = s.objectiveLog?.find((x) => x.gameId === g.id);
  return (
    <div className={styles.last}>
      <div className={styles.lastHead}>
        <span className={`${styles.lastWL} ${won ? styles.win : styles.loss}`}>{won ? 'W' : 'L'}</span>
        <span className={`${styles.lastScore} numeral`}>{mine}–{theirs}</span>
        <span className={styles.lastOpp}>{us ? 'vs' : 'at'} <BkImage path={opp.logo} alt={opp.abbr} className={styles.lastLogo} /> {opp.abbr}</span>
      </div>
      <div className={styles.lastTops}>
        {tops.map((l) => {
          const p = s.players[l.id];
          return (
            <button key={l.id} type="button" className={styles.lastTop} onClick={() => openPlayer(p.id)}>
              <BkImage path={p.face} alt={p.lastName} className={styles.lastFace} />
              <span className={styles.lastName}>{p.lastName}</span>
              <span className={styles.lastLine}>{l.pts} pts, {l.orb + l.drb} reb, {l.ast} ast</span>
            </button>
          );
        })}
      </div>
      {log && <div className={styles.lastObj}>Sponsor goals {log.met} of {log.total}{log.earned ? `, ${formatMoneyShort(log.earned)} earned` : ''}</div>}
    </div>
  );
}

// ---------- offseason ----------

const OFFSEASON_STAGES = ['Season review', 'Draft', 'Re-sign', 'Free agency', 'Training camp', 'New season'] as const;

function offseasonStageIndex(s: GameState): number {
  const st = s.offseason?.stage;
  if (!st) return 0;
  return { draft: 1, resign: 2, fa: 3, camp: 4 }[st];
}

function OffseasonHero({ s }: { s: GameState }) {
  const setTab = useUI((u) => u.setTab);
  const idx = offseasonStageIndex(s);
  const st = s.offseason?.stage;
  const hint = !st
    ? 'Continue to close the books on the season and run the draft lottery.'
    : st === 'draft' ? 'Scout the board and make your picks when you are on the clock.'
    : st === 'resign' ? 'Re-sign your own free agents before the market opens on July 1.'
    : st === 'fa' ? 'Sign free agents to fill out next season’s roster.'
    : 'Progression, breakouts and retirements land on your next Continue.';
  const jump = !st ? null
    : st === 'draft' ? { label: 'Go to the draft', fn: () => setTab('draft') }
    : st === 'resign' ? { label: 'Go to contracts', fn: () => setTab('squadHub') }
    : st === 'fa' ? { label: 'Go to free agents', fn: () => { useTransfersNav.getState().requestTab('fa'); setTab('transfers'); } }
    : null;
  return (
    <section className={`${styles.match} ${styles.off}`}>
      <header className={styles.mHead}>
        <span className={styles.mComp}>Offseason</span>
        <span className={styles.mWhen}>{formatDate(s.date)}</span>
      </header>
      <div className={`${styles.offStage} wordmark`}>{offseasonStageLabel(s)}</div>
      <div className={styles.timeline}>
        {OFFSEASON_STAGES.map((label, i) => (
          <div key={label} className={`${styles.tlStep} ${i < idx ? styles.tlDone : ''} ${i === idx ? styles.tlNow : ''}`}>
            <span className={styles.tlBar} />
            <span className={styles.tlLabel}>{label}</span>
          </div>
        ))}
      </div>
      <div className={styles.offFoot}>
        <span className={styles.offHint}>{hint}</span>
        {jump && <button type="button" className={styles.btnChalk} onClick={jump.fn}>{jump.label}</button>}
      </div>
    </section>
  );
}

function LastSeason({ s }: { s: GameState }) {
  const rec: SeasonRecord | undefined = s.history[s.history.length - 1];
  if (!rec) return <div className={styles.muted}>The season review arrives with your next Continue.</div>;
  const award = (label: string, id: string | null) => {
    const p = id ? s.players[id] : null;
    return (
      <div className={styles.awardRow} key={label}>
        <BkImage path={p?.face ?? null} alt={p?.lastName ?? label} className={styles.lastFace} />
        <span className={styles.awardLabel}>{label}</span>
        <span className={styles.awardName}>{p ? `${p.firstName[0]}. ${p.lastName}` : 'None'}</span>
      </div>
    );
  };
  return (
    <div className={styles.last}>
      <div className={styles.lastHead}>
        <span className={`${styles.lastScore} numeral`}>{rec.w}–{rec.l}</span>
        <span className={styles.lastOpp}>{rec.result}</span>
      </div>
      <div className={styles.lastObj}>{rec.objective}: <span className={rec.objectiveMet ? styles.pos : styles.neg}>{rec.objectiveMet ? 'met' : 'missed'}</span></div>
      {award('MVP', rec.awards.mvp)}{award('Defensive Player', rec.awards.dpoy)}{award('Rookie of the Year', rec.awards.roy)}{award('Most Improved', rec.awards.mip)}
    </div>
  );
}

// ---------- screen ----------

export default function HomeScreen() {
  const s = useGameState();
  const insights = useMemo(() => (s ? coachInsights(s) : []), [s]);
  if (!s) return null;
  const next = nextUserGame(s);
  const offseason = s.phase === 'offseason';
  const league = leagueOf(userTeam(s).league);
  return (
    <div className={styles.screen}>
      <WeekStrip s={s} />
      <div className={styles.grid}>
        <div className={styles.heroCol}>
          {offseason ? <OffseasonHero s={s} /> : next ? <NextMatch s={s} g={next} /> : (
            <section className={`${styles.match} ${styles.off}`}><div className={`${styles.offStage} wordmark`}>Season complete</div></section>
          )}
        </div>
        <div className={styles.statusCol}><SeasonStatus s={s} /></div>

        <Panel title="Needs your attention" className={styles.c4} headerRight={insights.length ? <span className={styles.count}>{insights.length}</span> : undefined}>
          <ActionItems items={insights} />
        </Panel>
        <Panel title="League wire" className={styles.c4}>
          <NewsFeed s={s} limit={7} />
        </Panel>
        <Panel title={`${league.short} power rankings`} className={styles.c4}>
          <PowerRankings s={s} limit={10} />
        </Panel>

        <Panel title="Rotation" className={styles.c5}>
          <SquadStatus s={s} />
        </Panel>
        <Panel title="Award races" className={styles.c4}>
          <AwardRaces s={s} />
        </Panel>
        <Panel title={offseason ? 'Season review' : 'Last result'} className={styles.c3}>
          {offseason ? <LastSeason s={s} /> : <LastResult s={s} />}
        </Panel>
      </div>
    </div>
  );
}
