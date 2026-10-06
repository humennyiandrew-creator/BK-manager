import { useMemo, type CSSProperties } from 'react';
import Panel from '../components/Panel';
import BkImage from '../components/BkImage';
import CountUp from '../components/CountUp';
import RingGauge from '../components/hub/RingGauge';
import ArcBadge from '../components/hub/ArcBadge';
import ObjectiveList from '../components/hub/ObjectiveList';
import NewsFeed from '../components/hub/NewsFeed';
import PowerRankings from '../components/hub/PowerRankings';
import AwardRaces from '../components/hub/AwardRaces';
import ActionItems from '../components/hub/ActionItems';
import { useGameState } from '../store/useGame';
import { useUI } from '../store/useUI';
import { useTransfersNav } from '../store/useTransfersNav';
import { formatDate, formatMoneyShort } from '../format';
import { coachInsights } from '../insights';
import {
  userTeam, nextUserGame, opponentOf, daysUntil, lastMeeting, lastUserGame, topPlayers, rotationTop8Avg
} from '../selectors';
import type { Game, GameState, Player, SeasonRecord } from '../../engine/model';
import { standings } from '../../engine/season';
import { offseasonStageLabel } from '../../engine/offseason';
import { leagueOf } from '../../engine/leagues';
import { objectiveLabel } from '../../engine/mgmt/board';
import { chemistryReport } from '../../engine/chemistry';
import { formChip } from './RosterScreen';
import styles from './HomeScreen.module.css';

// ---------- next match hero ----------

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
  if (g.type === 'regular') return `${leagueOf(g.comp ?? s.teams[g.home].league).short} · Regular season`;
  const se = s.series.find((x) => x.id === g.seriesId);
  if (!se) return g.type === 'playin' ? 'Play-In' : 'Playoffs';
  const us = s.userTeamId;
  const w = se.high === us ? se.winsHigh : se.winsLow, l = se.high === us ? se.winsLow : se.winsHigh;
  return `${g.type === 'playin' ? 'Play-In' : `Playoffs · Round ${se.round}`} · Game ${se.winsHigh + se.winsLow + 1}${se.bestOf > 1 ? ` · Series ${w}-${l}` : ''}`;
}

function NextMatch({ s, g }: { s: GameState; g: Game }) {
  const setTab = useUI((u) => u.setTab);
  const openPlayer = useUI((u) => u.openPlayer);
  const us = userTeam(s), opp = opponentOf(s, g);
  const rec = (id: string) => standings(s, undefined, s.teams[id].league ?? 'NBA').find((r) => r.teamId === id);
  const d = daysUntil(s, g.date);
  const odds = preGameOdds(s, g);
  const last = lastMeeting(s, opp.id);
  const objectives = s.matchObjectives?.gameId === g.id ? s.matchObjectives.list : null;
  const star = (id: string) => topPlayers(s, id, 6).find((p) => !p.injury);
  const side = (team: typeof us, align: 'left' | 'right') => {
    const r = rec(team.id), p = star(team.id);
    return (
      <div className={`${styles.nmSide} ${align === 'right' ? styles.nmRight : ''}`}>
        <BkImage path={team.logo} alt={team.abbr} className={styles.nmLogo} />
        <div className={styles.nmTeam}>
          <span className={styles.nmCity}>{team.city}</span>
          <span className={styles.nmName}>{team.name}</span>
          <span className={`${styles.nmRec} mono-num`}>{r ? `${r.w}-${r.l}` : '0-0'}</span>
        </div>
        {p && (
          <button type="button" className={styles.nmStar} onClick={() => openPlayer(p.id)}>
            <BkImage path={p.face} alt={p.lastName} className={styles.nmFace} />
            <span className={styles.nmStarName}>{p.lastName}</span>
            <span className={`${styles.nmStarOvr} mono-num`}>{p.ratings.ovr}</span>
          </button>
        )}
      </div>
    );
  };
  return (
    <section className={styles.nextMatch} style={{ '--us': us.colors.primary, '--them': opp.colors.primary } as CSSProperties}>
      <div className={styles.nmBg} />
      <div className={styles.nmTop}>
        <span className={styles.nmKicker}>Next match</span>
        <span className={styles.nmComp}>{gameLabel(s, g)}</span>
        <span className={styles.nmDate}>{formatDate(g.date)} · {g.home === us.id ? 'Home' : 'Away'}</span>
      </div>
      <div className={styles.nmMain}>
        {side(us, 'left')}
        <div className={styles.nmCenter}>
          <span className={styles.nmCount}>{d <= 0 ? 'TODAY' : d}</span>
          {d > 0 && <span className={styles.nmCountLabel}>{d === 1 ? 'day' : 'days'}</span>}
          <span className={styles.nmVs}>VS</span>
          <div className={styles.nmOdds}>
            <span className={styles.nmOddsLabel}>Win chance</span>
            <span className={styles.nmOddsBar}><span style={{ width: `${Math.round(odds * 100)}%` }} /></span>
            <span className="mono-num">{Math.round(odds * 100)}%</span>
          </div>
          {last && <span className={styles.nmLast}>Last meeting {last.home === us.id ? `${last.result!.home}-${last.result!.away}` : `${last.result!.away}-${last.result!.home}`}</span>}
        </div>
        {side(opp, 'right')}
      </div>
      <div className={styles.nmBottom}>
        <div className={styles.nmObjectives}>
          <span className={styles.nmSubhead}>Sponsor objectives</span>
          {objectives ? <ObjectiveList list={objectives} compact /> : <span className={styles.nmMuted}>Partners set their goals a few days before tip-off.</span>}
        </div>
        <div className={styles.nmActions}>
          <button type="button" className={styles.nmBtn} onClick={() => setTab('training')}>{s.prep && s.prep.gameId === g.id && !s.prep.prepared ? 'Set game plan' : 'Game plan'}</button>
          <button type="button" className={styles.nmBtnGhost} onClick={() => setTab('playbook')}>Tactics</button>
          <button type="button" className={styles.nmBtnGhost} onClick={() => setTab('roster')}>Lineup</button>
        </div>
      </div>
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

function SeasonStatus({ s }: { s: GameState }) {
  const team = userTeam(s);
  const nba = leagueOf(team.league).id === 'NBA';
  const table = standings(s, nba ? team.conference : undefined);
  const row = table.find((r) => r.teamId === team.id);
  const pos = row && row.w + row.l > 0 ? table.indexOf(row) + 1 : 0;
  const onTrack = objectiveOnTrack(s, pos, table.length);
  const chem = chemistryReport(s, team.id);
  return (
    <section className={styles.status}>
      <div className={styles.stTop}>
        <div className={styles.stPos}>
          <span className={styles.stHash}>#</span>
          <span className={`${styles.stPosNum} mono-num`}>{pos || '–'}</span>
        </div>
        <div className={styles.stInfo}>
          <span className={styles.stLabel}>{nba ? `${team.conference}ern Conference` : 'EuroLeague'}</span>
          <span className={`${styles.stRecord} mono-num`}>{row ? <><CountUp value={row.w} />-<CountUp value={row.l} /></> : '0-0'}</span>
          {row && row.w + row.l > 0 && (
            <span className={styles.stMeta}>
              {row.streak !== 0 && <span className={row.streak > 0 ? styles.pos : styles.neg}>{row.streak > 0 ? 'W' : 'L'}{Math.abs(row.streak)}</span>}
              <span>L10 {row.last10[0]}-{row.last10[1]}</span>
              <span>Net {((row.pf - row.pa) / (row.w + row.l)).toFixed(1)}</span>
            </span>
          )}
        </div>
      </div>
      <div className={styles.stObjective}>
        <span className={styles.stLabel}>Board objective</span>
        <span className={styles.stObjText}>{objectiveLabel(s.board.objective)}</span>
        {onTrack != null && s.phase !== 'offseason' && <span className={onTrack ? styles.onTrack : styles.offTrack}>{onTrack ? 'On track' : 'Off pace'}</span>}
      </div>
      <div className={styles.stRings}>
        <RingGauge value={s.board.confidence} label="Board" sub="confidence" color={s.board.confidence < 35 ? 'var(--negative)' : 'var(--accent)'} />
        <RingGauge value={s.finance.hype ?? 50} label="Fans" sub="hype" color="#e3a32e" />
        <RingGauge value={chem.score} label="Chemistry" sub={chem.mood} color={chem.score < 40 ? 'var(--negative)' : 'var(--positive)'} />
      </div>
    </section>
  );
}

// ---------- squad status ----------

function SquadStatus({ s }: { s: GameState }) {
  const openPlayer = useUI((u) => u.openPlayer);
  const team = userTeam(s);
  const ids = team.rotation.slice(0, 8);
  const ps = ids.map((id) => s.players[id]).filter(Boolean) as Player[];
  return (
    <div className={styles.squad}>
      {ps.map((p, i) => {
        const f = formChip(p.form);
        const fat = p.fatigue ?? 0;
        return (
          <button key={p.id} type="button" className={`${styles.sqRow} ${i === 5 ? styles.sqBench : ''}`} onClick={() => openPlayer(p.id)}>
            <span className={styles.sqPos}>{i < 5 ? p.positions[0] : 'BN'}</span>
            <BkImage path={p.face} alt={p.lastName} className={styles.sqFace} />
            <span className={styles.sqWho}>
              <span className={styles.sqName}>{p.firstName[0]}. {p.lastName}</span>
              <span className={styles.sqTags}>
                {p.injury ? <span className={styles.sqInj}>{p.injury.name} · {p.injury.daysLeft}d</span> : <ArcBadge arc={p.arc} season={s.season} />}
              </span>
            </span>
            <span className={`${styles.sqForm} ${styles[f.variant]}`} title="Form">{f.icon}</span>
            <span className={styles.sqFat} title={`Fatigue ${Math.round(fat)}`}><span style={{ width: `${fat}%`, background: fat >= 70 ? 'var(--negative)' : fat >= 45 ? '#e3a32e' : 'var(--positive)' }} /></span>
            <span className={styles.sqMorale} style={{ background: p.morale >= 65 ? 'var(--positive)' : p.morale >= 40 ? '#e3a32e' : 'var(--negative)' }} title={`Morale ${p.morale}`} />
            <span className={`${styles.sqOvr} mono-num`}>{p.ratings.ovr}</span>
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
        <span className={`${styles.lastWL} ${won ? styles.pos : styles.neg}`}>{won ? 'W' : 'L'}</span>
        <span className={`${styles.lastScore} mono-num`}>{mine}-{theirs}</span>
        <span className={styles.lastOpp}>{us ? 'vs' : '@'} <BkImage path={opp.logo} alt={opp.abbr} className={styles.lastLogo} /> {opp.abbr}</span>
      </div>
      <div className={styles.lastTops}>
        {tops.map((l) => {
          const p = s.players[l.id];
          return (
            <button key={l.id} type="button" className={styles.lastTop} onClick={() => openPlayer(p.id)}>
              <BkImage path={p.face} alt={p.lastName} className={styles.lastFace} />
              <span className={styles.lastName}>{p.lastName}</span>
              <span className="mono-num">{l.pts} pts · {l.orb + l.drb} reb · {l.ast} ast</span>
            </button>
          );
        })}
      </div>
      {log && <div className={styles.lastObj}>Sponsor goals {log.met}/{log.total}{log.earned ? ` · +${formatMoneyShort(log.earned)}` : ''}</div>}
    </div>
  );
}

// ---------- offseason ----------

const OFFSEASON_STAGES = ['Season Review', 'Draft', 'Re-sign', 'Free Agency', 'Training Camp', 'New Season'] as const;

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
    ? 'Press Continue to finalize the season and open the draft lottery.'
    : st === 'draft' ? 'Scout the board and make your picks when it’s your turn on the clock.'
    : st === 'resign' ? 'Re-sign your own expiring free agents before the market opens July 1.'
    : st === 'fa' ? 'Sign free agents to fill out next season’s roster.'
    : 'Progression, breakouts and retirements land on your next Continue.';
  const jump = !st ? null
    : st === 'draft' ? { label: 'Go to Draft', fn: () => setTab('draft') }
    : st === 'resign' ? { label: 'Go to Contracts', fn: () => setTab('squadHub') }
    : st === 'fa' ? { label: 'Go to Free Agents', fn: () => { useTransfersNav.getState().requestTab('fa'); setTab('transfers'); } }
    : null;
  return (
    <section className={`${styles.nextMatch} ${styles.offHero}`}>
      <div className={styles.nmBg} />
      <div className={styles.nmTop}>
        <span className={styles.nmKicker}>Offseason</span>
        <span className={styles.nmComp}>{s.season} → next season</span>
      </div>
      <div className={styles.offStage}>{offseasonStageLabel(s)}</div>
      <div className={styles.timeline}>
        {OFFSEASON_STAGES.map((label, i) => (
          <div key={label} className={`${styles.tlStep} ${i < idx ? styles.tlDone : ''} ${i === idx ? styles.tlNow : ''}`}>
            <span className={styles.tlBar} />
            <span className={styles.tlLabel}>{label}</span>
          </div>
        ))}
      </div>
      <div className={styles.offHint}>{hint}</div>
      {jump && <button type="button" className={styles.nmBtn} onClick={jump.fn}>{jump.label}</button>}
    </section>
  );
}

function LastSeason({ s }: { s: GameState }) {
  const rec: SeasonRecord | undefined = s.history[s.history.length - 1];
  if (!rec) return <div className={styles.muted}>Season review comes after your next Continue.</div>;
  const award = (label: string, id: string | null) => {
    const p = id ? s.players[id] : null;
    return (
      <div className={styles.awardRow} key={label}>
        <BkImage path={p?.face ?? null} alt={p?.lastName ?? label} className={styles.lastFace} />
        <span className={styles.awardLabel}>{label}</span>
        <span className={styles.awardName}>{p ? `${p.firstName[0]}. ${p.lastName}` : '—'}</span>
      </div>
    );
  };
  return (
    <div className={styles.last}>
      <div className={styles.lastHead}>
        <span className={`${styles.lastScore} mono-num`}>{rec.w}-{rec.l}</span>
        <span className={styles.lastOpp}>{rec.result}</span>
      </div>
      <div className={styles.lastObj}>{rec.objective} — <span className={rec.objectiveMet ? styles.pos : styles.neg}>{rec.objectiveMet ? 'met' : 'missed'}</span></div>
      {award('MVP', rec.awards.mvp)}{award('DPOY', rec.awards.dpoy)}{award('ROY', rec.awards.roy)}{award('MIP', rec.awards.mip)}
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
      <div className={styles.grid}>
        <div className={styles.heroCol}>
          {offseason ? <OffseasonHero s={s} /> : next ? <NextMatch s={s} g={next} /> : (
            <section className={`${styles.nextMatch} ${styles.offHero}`}><div className={styles.nmBg} /><div className={styles.offStage}>Season complete</div></section>
          )}
        </div>
        <div className={styles.statusCol}><SeasonStatus s={s} /></div>

        <Panel title="Action Items" className={styles.c4} headerRight={insights.length ? <span className={styles.count}>{insights.length}</span> : undefined}>
          <ActionItems items={insights} />
        </Panel>
        <Panel title="League Wire" className={styles.c4}>
          <NewsFeed s={s} limit={7} />
        </Panel>
        <Panel title={`${league.short} Power Rankings`} className={styles.c4}>
          <PowerRankings s={s} limit={10} />
        </Panel>

        <Panel title="Squad Status" className={styles.c5}>
          <SquadStatus s={s} />
        </Panel>
        <Panel title="Award Races" className={styles.c4}>
          <AwardRaces s={s} />
        </Panel>
        <Panel title={offseason ? 'Season Review' : 'Last Result'} className={styles.c3}>
          {offseason ? <LastSeason s={s} /> : <LastResult s={s} />}
        </Panel>
      </div>
    </div>
  );
}
