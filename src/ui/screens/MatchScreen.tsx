import { useEffect, useRef, useState } from 'react';
import { useGame, useGameState } from '../store/useGame';
import { useMatch } from '../store/useMatch';
import { useUI } from '../store/useUI';
import { applyResult, advanceDay, continueGame } from '../../engine/season';
import { SYSTEMS, SCHEMES } from '../../engine/playbook/systems';
import { PLAYS } from '../../engine/playbook/plays';
import type { OffSystem, DefScheme } from '../../engine/playbook/types';
import type { Side, SP } from '../../engine/sim/fast';
import type { PbpLine, Snapshot } from '../../engine/sim/live';
import { lineupProfile, offenseFit, defenseFit } from '../../engine/playbook/fit';
import BkImage from '../components/BkImage';
import BipolarBar from '../components/BipolarBar';
import { COURT_W, COURT_H, colorDist, drawBall, drawBallTrail, drawCourt, drawPlayer, drawScreen, fitCourt } from '../court';
import { FlowChart, ShotChart } from '../components/match/MatchCharts';
import { IntensityControl, MomentumMeter, RunBanner, TeamTalkPicker, WinBar } from '../components/match/MatchHud';
import { PostgameReport, PregamePreview, objectiveStatusFn } from '../components/match/MatchReport';
import { formatMoneyShort } from '../format';
import { play, startCrowd, stopCrowd, crowdIntensity } from '../sound';
import styles from './MatchScreen.module.css';

/** Finds the scoring player's id by matching the pbp line's leading name against both rosters. */
function scorerIdFromText(text: string, home: Side, away: Side): string | null {
  for (const sp of [...home.roster, ...away.roster]) {
    if (text.startsWith(`${sp.p.firstName} ${sp.p.lastName} makes`)) return sp.p.id;
  }
  return null;
}

/** Plays the right SFX for one new play-by-play line, throttled by sim speed to avoid noise spam. */
function handlePbpSound(
  line: PbpLine,
  speed: number,
  swishRef: { current: number },
  prevRef: { current: PbpLine | null },
  closeQ4: boolean
) {
  const periodEnd = line.kind === 'info' && (line.text.startsWith('End of') || line.text.startsWith('Final:'));
  const timeout = line.kind === 'info' && line.text.startsWith('Timeout');

  if (speed >= 10) {
    if (periodEnd) play('buzzer');
    prevRef.current = line;
    return;
  }
  if (speed >= 5) {
    if (periodEnd) play('buzzer');
    else if (timeout || line.kind === 'foul') play('whistle');
    else if (line.kind === 'score' && line.text.includes('makes') && !line.text.includes('free throw')) {
      swishRef.current++;
      if (swishRef.current % 3 === 0) play('swish');
    }
    prevRef.current = line;
    return;
  }
  if (periodEnd) { play('buzzer'); prevRef.current = line; return; }
  if (timeout || line.kind === 'foul') { play('whistle'); prevRef.current = line; return; }
  if (line.kind === 'to') { crowdIntensity(closeQ4 ? 0.95 : 0.6); prevRef.current = line; return; }
  if (line.kind === 'score') {
    const isFt = line.text.includes('free throw');
    if (isFt) {
      const prev = prevRef.current;
      const andOne = !!prev && prev.kind === 'score' && !prev.text.includes('free throw') && line.text.includes('1 of 1');
      play('swish');
      if (andOne) play('crowdCheer');
    } else {
      play('swish');
      const big = line.text.includes('three') || line.text.includes('dunk');
      if (big) { play('crowdCheer'); if (closeQ4) crowdIntensity(1); }
    }
    prevRef.current = line;
    return;
  }
  if (line.kind === 'miss') {
    play(line.text.includes('blocked by') ? 'dribble' : 'rim');
    prevRef.current = line;
    return;
  }
  prevRef.current = line;
}

const hexAlpha = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
};

function fmtClock(sec: number): string {
  if (sec < 60) return sec.toFixed(1);
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
const periodLabel = (p: number) => (p <= 4 ? `Q${p}` : `OT${p - 4}`);

type RightTab = 'pbp' | 'box' | 'flow' | 'shots' | 'tactics' | 'lineup';
const RIGHT_TABS: Record<RightTab, string> = { pbp: 'Feed', box: 'Box', flow: 'Flow', shots: 'Shots', tactics: 'Tactics', lineup: 'Lineup' };

export default function MatchScreen() {
  const s = useGameState();
  const mutate = useGame((g) => g.mutate);
  const save = useGame((g) => g.save);
  const game = useMatch((m) => m.game);
  const match = useMatch((m) => m.match);
  const speed = useMatch((m) => m.speed);
  const paused = useMatch((m) => m.paused);
  const setSpeed = useMatch((m) => m.setSpeed);
  const setPaused = useMatch((m) => m.setPaused);
  const clearMatch = useMatch((m) => m.clear);
  const setView = useUI((u) => u.setView);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, setTick] = useState(0);
  const [rightTab, setRightTab] = useState<RightTab>('pbp');
  const [subOut, setSubOut] = useState<string | null>(null);
  const [calledPlay, setCalledPlay] = useState('');

  const pbpLenRef = useRef(0);
  const swishCountRef = useRef(0);
  const prevLineRef = useRef<PbpLine | null>(null);
  const ballTrailRef = useRef<{ x: number; y: number }[]>([]);
  const scorerGlowRef = useRef<Map<string, number>>(new Map());
  const lastCrowdUpdateRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !match || !s || !game) return;
    const home = s.teams[game.home], away = s.teams[game.away];
    const homeColor = home.colors.primary;
    const awayColor = colorDist(home.colors.primary, away.colors.primary) < 60 ? away.colors.secondary : away.colors.primary;
    const fillOf = (side: 0 | 1) => (side === 0 ? homeColor : awayColor);
    const matchH = match.H, matchA = match.A;

    pbpLenRef.current = 0;
    swishCountRef.current = 0;
    prevLineRef.current = null;
    ballTrailRef.current = [];
    scorerGlowRef.current = new Map();

    let fit = fitCourt(canvas, COURT_W, COURT_H);
    const ro = new ResizeObserver(() => { fit = fitCourt(canvas, COURT_W, COURT_H); });
    ro.observe(canvas.parentElement!);

    let last = performance.now();
    let lastUi = 0;
    let breakSince: number | null = null;
    let raf = 0;

    function frame(now: number) {
      const dtReal = Math.min(0.25, (now - last) / 1000);
      last = now;
      const st = useMatch.getState();
      if (match!.state === 'live' && !st.paused) {
        let remain = dtReal * st.speed;
        while (remain > 1e-6) { const step = Math.min(0.05, remain); match!.step(step); remain -= step; }
      } else if (match!.state === 'break') {
        if (breakSince == null) breakSince = now;
        if (!st.paused && now - breakSince > 2000) match!.resume();
      } else {
        breakSince = null;
      }

      const snap = match!.snapshot();

      // New play-by-play lines since last frame drive SFX + crowd murmur.
      if (snap.pbp.length > pbpLenRef.current) {
        const newLines = snap.pbp.slice(pbpLenRef.current);
        pbpLenRef.current = snap.pbp.length;
        const closeQ4 = snap.period >= 4 && Math.abs(snap.score[0] - snap.score[1]) <= 8;
        for (const line of newLines) {
          handlePbpSound(line, st.speed, swishCountRef, prevLineRef, closeQ4);
          if (line.kind === 'score' && !line.text.includes('free throw')) {
            const id = scorerIdFromText(line.text, matchH, matchA);
            if (id) scorerGlowRef.current.set(id, now);
          }
        }
      }

      // Ambience intensity from score margin + period + clock (tight Q4 = loud); throttled.
      if (snap.state === 'live' && now - lastCrowdUpdateRef.current > 600) {
        lastCrowdUpdateRef.current = now;
        const margin = Math.abs(snap.score[0] - snap.score[1]);
        const tightness = margin <= 5 ? 1 : margin <= 10 ? 0.6 : 0.3;
        const periodFactor = snap.period >= 4 ? 1 : 0.55;
        const clockFactor = snap.period >= 4 && snap.clock < 120 ? 1 : 0.7;
        crowdIntensity(tightness * 0.5 + periodFactor * 0.3 + clockFactor * 0.2);
      }

      const ctx = fit.ctx;
      ctx.clearRect(0, 0, COURT_W, COURT_H);
      // Home attacks the right basket in periods 1-2, the left basket from period 3 on (post-halftime end swap).
      // drawCourt's `home` tint paints the left end and `away` paints the right end, so swap the colors to match.
      const homeAttacksRight = snap.period <= 2;
      drawCourt(ctx, 'full', homeAttacksRight
        ? { home: hexAlpha(awayColor, 0.08), away: hexAlpha(homeColor, 0.08) }
        : { home: hexAlpha(homeColor, 0.08), away: hexAlpha(awayColor, 0.08) });
      for (const [aId, bId] of snap.screens) {
        const a = snap.players.find((p) => p.id === aId), b = snap.players.find((p) => p.id === bId);
        if (a && b) drawScreen(ctx, a.x, a.y, b.x, b.y);
      }
      for (const p of snap.players) {
        const glowTs = scorerGlowRef.current.get(p.id);
        const glow = glowTs ? Math.max(0, 1 - (now - glowTs) / 650) : 0;
        if (glowTs && glow <= 0) scorerGlowRef.current.delete(p.id);
        const heat = p.streak >= 3 ? 1 : p.streak <= -4 ? -1 : 0;
        drawPlayer(ctx, { x: p.x, y: p.y, label: p.jersey, sub: p.name, energy: p.energy, fouls: p.fouls, fill: fillOf(p.side), hasBall: p.ball, glow, heat, pulse: (Math.sin(now / 160) + 1) / 2 });
      }
      if (snap.state !== 'pregame') {
        const trail = ballTrailRef.current;
        trail.push({ x: snap.ball.x, y: snap.ball.y });
        if (trail.length > 6) trail.shift();
        drawBallTrail(ctx, trail);
        drawBall(ctx, snap.ball.x, snap.ball.y, snap.ball.z);
      }

      if (now - lastUi > 120) { lastUi = now; setTick((t) => t + 1); }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

  // Stop ambience if the player navigates away from the screen entirely.
  useEffect(() => () => stopCrowd(), []);

  if (!s || !game || !match) return null;

  const home = s.teams[game.home], away = s.teams[game.away];
  const userSide = match.userSide ?? 0;
  const userTeamState = s.teams[s.userTeamId];
  const userSideObj: Side = userSide === 0 ? match.H : match.A;
  const snap: Snapshot = match.snapshot();
  const maxTo = match.maxTimeouts();
  const objectives = s.matchObjectives?.gameId === game.id ? s.matchObjectives.list : null;
  const objStatus = objectiveStatusFn(match, userSide);
  const homeColor = home.colors.primary;
  const awayColor = colorDist(home.colors.primary, away.colors.primary) < 60 ? away.colors.secondary : away.colors.primary;
  const sides = { homeColor, awayColor, homeAbbr: home.abbr, awayAbbr: away.abbr };

  function handleTipOff() { startCrowd(); match!.start(); }
  function handleQuickSim() {
    stopCrowd();
    mutate((st) => continueGame(st));
    void save();
    clearMatch();
    setView('shell');
  }
  function handleContinueFinal() {
    stopCrowd();
    const g = game!, m = match!;
    mutate((st) => { applyResult(st, g, m.result()); advanceDay(st); });
    void save();
    clearMatch();
    setView('shell');
  }
  function handleTactic(fn: (t: typeof userTeamState.tactics) => void) {
    mutate((st) => fn(st.teams[st.userTeamId].tactics));
  }

  return (
    <div className={styles.wrap}>
      <Scoreboard s={s} game={game} snap={snap} home={home} away={away} maxTo={maxTo} />
      <div className={styles.hud}>
        <div className={styles.hudObjectives}>
          {objectives ? objectives.map((o) => {
            const st = objStatus(o);
            return (
              <span key={o.id} className={`${styles.objChip} ${styles[`obj_${st.status}`]}`} title={`${o.sponsor} · ${formatMoneyShort(o.reward)}`}>
                <span className={styles.objMark}>{st.status === 'met' ? '✓' : st.status === 'failed' ? '✗' : '◆'}</span>
                {o.label}
                <b className="mono-num">{o.stat === 'win' ? '' : o.stat === 'fgPct' ? `${st.value}%` : st.value}</b>
              </span>
            );
          }) : <span className={styles.hudMuted}>No sponsor objectives for this game</span>}
        </div>
        <MomentumMeter value={snap.momentum} {...sides} />
        <WinBar wp={snap.winProb} {...sides} />
      </div>

      <div className={styles.main}>
        <div className={styles.courtWrap}>
          <canvas ref={canvasRef} />
          {snap.state === 'live' && <RunBanner run={snap.run} abbr={snap.run ? (snap.run.side === 0 ? home.abbr : away.abbr) : ''} color={snap.run?.side === 0 ? homeColor : awayColor} />}
          {snap.state === 'pregame' && (
            <Overlay wide>
              <PregamePreview
                match={match}
                objectives={objectives}
                header={null}
                actions={(
                  <div className={styles.overlayBtns}>
                    <button className={styles.primaryBtn} onClick={handleTipOff}>Tip-Off</button>
                    <button className={styles.secondaryBtn} onClick={handleQuickSim}>Quick sim</button>
                  </div>
                )}
              />
            </Overlay>
          )}
          {snap.state === 'timeout' && (
            <Overlay wide>
              <div className={styles.overlayTitle}>{([...snap.pbp].reverse().find((l) => l.text.startsWith('Timeout'))?.text ?? 'Timeout').toUpperCase()}</div>
              <div className={styles.overlayHint}>Give the huddle a message, adjust Tactics or Lineup, then resume.</div>
              <TeamTalkPicker used={match.talkUsed[userSide]} active={snap.talk[userSide]} onPick={(t) => { match!.teamTalk(userSide, t); setTick((x) => x + 1); }} />
              <button className={styles.primaryBtn} onClick={() => match!.resume()}>Resume</button>
            </Overlay>
          )}
          {snap.state === 'break' && (
            <Overlay>
              <div className={styles.overlayTitle}>{snap.period <= 4 && snap.period === 3 ? 'Halftime' : `End of ${periodLabel(snap.period - 1)}`}</div>
              <LineScore snap={snap} home={home} away={away} />
              <button className={styles.primaryBtn} onClick={() => match!.resume()}>Resume now</button>
            </Overlay>
          )}
          {snap.state === 'final' && (
            <Overlay wide>
              <PostgameReport
                s={s}
                match={match}
                userSide={userSide}
                objectives={objectives}
                lineScore={<LineScore snap={snap} home={home} away={away} />}
                actions={<button className={styles.primaryBtn} onClick={handleContinueFinal}>Continue</button>}
              />
            </Overlay>
          )}
        </div>

        <div className={styles.rightPanel}>
          <div className={styles.tabsRow}>
            {(Object.keys(RIGHT_TABS) as RightTab[]).map((t) => (
              <button key={t} className={t === rightTab ? `${styles.tab} ${styles.tabActive}` : styles.tab} onClick={() => setRightTab(t)}>
                {RIGHT_TABS[t]}
              </button>
            ))}
          </div>
          <div className={styles.tabBody}>
            {rightTab === 'pbp' && <PbpTab pbp={snap.pbp} home={home.colors.primary} away={away.colors.primary} />}
            {rightTab === 'box' && <BoxTab home={match.H} away={match.A} homeAbbr={home.abbr} awayAbbr={away.abbr} />}
            {rightTab === 'flow' && <FlowChart flow={match.flow} rules={match.rules} {...sides} />}
            {rightTab === 'shots' && <ShotChart shots={match.shots} homeAbbr={home.abbr} awayAbbr={away.abbr} nameOf={(id) => s.players[id]?.lastName ?? '?'} />}
            {rightTab === 'tactics' && (
              <TacticsTab
                tactics={userTeamState.tactics}
                roster={userSideObj.roster}
                court={userSideObj.court}
                onOffense={(v: OffSystem) => handleTactic((t) => (t.offense = v))}
                onDefense={(v: DefScheme) => handleTactic((t) => (t.defense = v))}
                onSlider={(k: string, v: number) => handleTactic((t) => ((t as any)[k] = v))}
                onFocus={(v: string) => handleTactic((t) => (t.focusPlayer = v || null))}
                onClutch={(v: string) => handleTactic((t) => (t.clutchPlay = v || null))}
                calledPlay={calledPlay}
                onCalledPlayChange={setCalledPlay}
                onCallPlay={() => { match!.callPlay(userSide, calledPlay || null); }}
              />
            )}
            {rightTab === 'lineup' && (
              <LineupTab
                side={userSideObj}
                subOut={subOut}
                onPickCourt={(id) => setSubOut(id)}
                onPickBench={(id) => { if (subOut) { match!.sub(userSide, subOut, id); setSubOut(null); } }}
                autoSubs={match.autoSubs[userSide]}
                onAutoSubs={(v) => { match!.autoSubs[userSide] = v; setTick((t) => t + 1); }}
              />
            )}
          </div>
        </div>
      </div>

      <div className={styles.controls}>
        <button className={styles.controlBtn} onClick={() => setPaused(!paused)} disabled={snap.state !== 'live'}>
          {paused ? '▶ Play' : '⏸ Pause'}
        </button>
        <div className={styles.speedGroup}>
          {[1, 2, 5, 10, 20].map((n) => (
            <button key={n} className={n === speed ? `${styles.speedBtn} ${styles.speedBtnActive}` : styles.speedBtn} onClick={() => setSpeed(n)}>
              {n}×
            </button>
          ))}
          <input
            type="range" min={1} max={20} step={1} value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className={styles.speedSlider}
          />
        </div>
        <IntensityControl value={snap.intensity[userSide]} onChange={(v) => { match!.setIntensity(userSide, v); setTick((x) => x + 1); }} disabled={snap.state === 'final'} />
        <button className={styles.controlBtn} onClick={() => match!.requestTimeout(userSide)} disabled={snap.timeouts[userSide] <= 0 || snap.state !== 'live'}>
          Timeout ({snap.timeouts[userSide]})
        </button>
        <button className={styles.controlBtn} onClick={() => { match!.simToEnd(); setTick((t) => t + 1); }} disabled={snap.state === 'final'}>
          Sim to End
        </button>
      </div>
    </div>
  );
}

// ---------- scoreboard ----------

function Scoreboard({ s, game, snap, home, away, maxTo }: any) {
  const clockCls = snap.clock < 24 ? `${styles.sbClock} ${styles.clockRed}` : snap.clock < 60 ? `${styles.sbClock} ${styles.clockAmber}` : styles.sbClock;
  const shotUrgent = snap.state === 'live' && snap.shotClock <= 5;
  return (
    <div className={styles.scoreboard}>
      <TeamScore team={home} score={snap.score[0]} bonus={snap.bonus[0]} timeouts={snap.timeouts[0]} maxTo={maxTo} possession={snap.possession === 0} align="left" />
      <div className={styles.sbCenter}>
        <div className={styles.sbPeriod}>{periodLabel(snap.period)}</div>
        <div className={clockCls}>{fmtClock(snap.clock)}</div>
        <div className={shotUrgent ? `${styles.sbShotClock} ${styles.shotUrgent}` : styles.sbShotClock}>{snap.state === 'live' ? Math.ceil(snap.shotClock) : '--'}</div>
        {snap.play && <div className={styles.sbPlay}>Running: {snap.play}</div>}
      </div>
      <TeamScore team={away} score={snap.score[1]} bonus={snap.bonus[1]} timeouts={snap.timeouts[1]} maxTo={maxTo} possession={snap.possession === 1} align="right" />
    </div>
  );
}

function TeamScore({ team, score, bonus, timeouts, maxTo, possession, align }: any) {
  return (
    <div className={align === 'left' ? styles.sbTeam : `${styles.sbTeam} ${styles.sbTeamRight}`}>
      {align === 'left' && <BkImage path={team.logo} alt={team.abbr} className={styles.sbLogo} />}
      <div className={styles.sbTeamInfo}>
        <div className={styles.sbAbbrRow}>
          {possession && align === 'left' && <span className={styles.sbArrow}>▶</span>}
          <span className={styles.sbAbbr}>{team.abbr}</span>
          {possession && align === 'right' && <span className={styles.sbArrow}>◀</span>}
        </div>
        <div className={styles.sbPipsRow}>
          {Array.from({ length: maxTo }).map((_, i) => (
            <span key={i} className={i < timeouts ? styles.pip : `${styles.pip} ${styles.pipEmpty}`} />
          ))}
          {bonus && <span className={styles.bonusTag}>BONUS</span>}
        </div>
      </div>
      <span key={score} className={`${styles.sbScore} ${styles.sbScorePop}`} style={{ '--flash-color': team.colors.primary } as any}>{score}</span>
      {align === 'right' && <BkImage path={team.logo} alt={team.abbr} className={styles.sbLogo} />}
    </div>
  );
}

function LineScore({ snap, home, away }: { snap: Snapshot; home: any; away: any }) {
  const periods = snap.state === 'break' ? snap.period - 1 : snap.period;
  const rows: [number, number][] = [];
  let prevH = 0, prevA = 0;
  for (let p = 1; p <= periods; p++) {
    const entries = snap.pbp.filter((l) => l.period === p);
    const last = entries.at(-1);
    const h = last ? last.home : prevH, a = last ? last.away : prevA;
    rows.push([h - prevH, a - prevA]);
    prevH = h; prevA = a;
  }
  return (
    <table className={styles.lineScore}>
      <thead>
        <tr><th />{rows.map((_, i) => <th key={i}>{periodLabel(i + 1)}</th>)}<th>T</th></tr>
      </thead>
      <tbody>
        <tr><td>{home.abbr}</td>{rows.map((r, i) => <td key={i}>{r[0]}</td>)}<td>{snap.score[0]}</td></tr>
        <tr><td>{away.abbr}</td>{rows.map((r, i) => <td key={i}>{r[1]}</td>)}<td>{snap.score[1]}</td></tr>
      </tbody>
    </table>
  );
}

function Overlay({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`${styles.overlayBackdrop} fade-in`}>
      <div className={`${wide ? `${styles.overlayPanel} ${styles.overlayPanelWide}` : styles.overlayPanel} slide-up`}>{children}</div>
    </div>
  );
}

// ---------- right panel tabs ----------

function PbpTab({ pbp, home, away }: { pbp: PbpLine[]; home: string; away: string }) {
  const lines = [...pbp].reverse();
  return (
    <div className={styles.pbpList}>
      {lines.map((l, i) => (
        <div key={i} className={styles.pbpRow}>
          <span className={styles.pbpBar} style={{ background: l.side === 0 ? home : l.side === 1 ? away : 'transparent' }} />
          <div className={styles.pbpBody}>
            <span className={styles.pbpClock}>{periodLabel(l.period)} {fmtClock(l.clock)}</span>
            <span className={l.kind === 'score' ? styles.pbpTextBold : styles.pbpText}>{l.text}</span>
          </div>
          <span className={styles.pbpScore}>{l.home}-{l.away}</span>
        </div>
      ))}
    </div>
  );
}

const BOX_COLS: { key: string; label: string; render: (sp: SP) => string }[] = [
  { key: 'min', label: 'MIN', render: (sp) => (sp.sec / 60).toFixed(1) },
  { key: 'pts', label: 'PTS', render: (sp) => String(sp.line.pts) },
  { key: 'reb', label: 'REB', render: (sp) => String(sp.line.orb + sp.line.drb) },
  { key: 'ast', label: 'AST', render: (sp) => String(sp.line.ast) },
  { key: 'stl', label: 'STL', render: (sp) => String(sp.line.stl) },
  { key: 'blk', label: 'BLK', render: (sp) => String(sp.line.blk) },
  { key: 'tov', label: 'TOV', render: (sp) => String(sp.line.tov) },
  { key: 'pf', label: 'PF', render: (sp) => String(sp.line.pf) },
  { key: 'shooting', label: 'FG 3P FT', render: (sp) => `${sp.line.fgm}-${sp.line.fga} ${sp.line.tpm}-${sp.line.tpa} ${sp.line.ftm}-${sp.line.fta}` },
  { key: 'pm', label: '+/-', render: (sp) => (sp.line.pm > 0 ? `+${sp.line.pm}` : String(sp.line.pm)) }
];

function BoxTab({ home, away, homeAbbr, awayAbbr }: { home: Side; away: Side; homeAbbr: string; awayAbbr: string }) {
  return (
    <div className={styles.boxWrap}>
      <BoxTable side={home} label={homeAbbr} />
      <BoxTable side={away} label={awayAbbr} />
    </div>
  );
}

function BoxTable({ side, label }: { side: Side; label: string }) {
  const onCourt = new Set(side.court);
  const rows = [...side.roster].sort((a, b) => (onCourt.has(b) ? 1 : 0) - (onCourt.has(a) ? 1 : 0) || b.sec - a.sec);
  return (
    <table className={styles.boxTable}>
      <thead>
        <tr>
          <th className={styles.boxName}>{label}</th>
          {BOX_COLS.map((c) => <th key={c.key}>{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((sp) => (
          <tr key={sp.p.id} className={onCourt.has(sp) ? styles.boxOnCourt : undefined}>
            <td className={styles.boxName}>{sp.p.lastName}</td>
            {BOX_COLS.map((c) => <td key={c.key}>{c.render(sp)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TacticsTab({ tactics, roster, court, onOffense, onDefense, onSlider, onFocus, onClutch, calledPlay, onCalledPlayChange, onCallPlay }: any) {
  const five = (court as SP[]).map((sp) => sp.p);
  const fit = five.length === 5
    ? (() => { const prof = lineupProfile(five); return { off: offenseFit(prof, tactics), def: defenseFit(prof, tactics.defense) }; })()
    : null;
  const fitNotes = fit ? [...fit.off.notes, ...fit.def.notes].slice(0, 2) : [];
  return (
    <div className={styles.tacticsWrap}>
      {fit && (
        <div className={styles.fitBox}>
          <BipolarBar label="Lineup offense fit" value={fit.off.score} />
          <BipolarBar label="Lineup defense fit" value={fit.def.score} />
          {fitNotes.map((n, i) => <div key={i} className={styles.fitNote}>{n}</div>)}
        </div>
      )}
      <div className={styles.tField}>
        <label>Offense</label>
        <select value={tactics.offense} onChange={(e) => onOffense(e.target.value as OffSystem)}>
          {Object.values(SYSTEMS).map((sys) => <option key={sys.id} value={sys.id}>{sys.name}</option>)}
        </select>
      </div>
      <div className={styles.tField}>
        <label>Defense</label>
        <select value={tactics.defense} onChange={(e) => onDefense(e.target.value as DefScheme)}>
          {Object.values(SCHEMES).map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
        </select>
      </div>
      {(['pace', 'threeFocus', 'crashGlass', 'transition'] as const).map((k) => (
        <div key={k} className={styles.sliderRow}>
          <label>{k === 'threeFocus' ? '3PT Focus' : k === 'crashGlass' ? 'Crash Glass' : k[0].toUpperCase() + k.slice(1)}</label>
          <input type="range" min={0} max={100} value={tactics[k]} onChange={(e) => onSlider(k, Number(e.target.value))} />
          <span>{tactics[k]}</span>
        </div>
      ))}
      <div className={styles.tField}>
        <label>Focus player</label>
        <select value={tactics.focusPlayer ?? ''} onChange={(e) => onFocus(e.target.value)}>
          <option value="">None</option>
          {roster.map((sp: SP) => <option key={sp.p.id} value={sp.p.id}>{sp.p.lastName}</option>)}
        </select>
      </div>
      <div className={styles.tField}>
        <label>Clutch play</label>
        <select value={tactics.clutchPlay ?? ''} onChange={(e) => onClutch(e.target.value)}>
          <option value="">Auto</option>
          {PLAYS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className={styles.tField}>
        <label>Call next possession</label>
        <div className={styles.callRow}>
          <select value={calledPlay} onChange={(e) => onCalledPlayChange(e.target.value)}>
            <option value="">—</option>
            {PLAYS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className={styles.smallBtn} onClick={onCallPlay}>Call</button>
        </div>
      </div>
    </div>
  );
}

function LineupTab({ side, subOut, onPickCourt, onPickBench, autoSubs, onAutoSubs }: {
  side: Side; subOut: string | null; onPickCourt: (id: string) => void; onPickBench: (id: string) => void;
  autoSubs: boolean; onAutoSubs: (v: boolean) => void;
}) {
  const onCourt = new Set(side.court);
  const bench = side.roster.filter((sp) => !onCourt.has(sp));
  return (
    <div className={styles.lineupWrap}>
      <label className={styles.autoSubsRow}>
        <input type="checkbox" checked={autoSubs} onChange={(e) => onAutoSubs(e.target.checked)} /> Auto-subs
      </label>
      <div className={styles.lineupLabel}>On court</div>
      {side.court.map((sp) => (
        <button key={sp.p.id} className={sp.p.id === subOut ? `${styles.lineupRow} ${styles.lineupRowSelected}` : styles.lineupRow} onClick={() => onPickCourt(sp.p.id)}>
          <span>{sp.p.lastName}</span>
          <span className={styles.lineupEnergy}><span style={{ width: `${sp.energy * 100}%` }} /></span>
          <span className={styles.lineupPf}>{sp.line.pf} PF</span>
        </button>
      ))}
      <div className={styles.lineupLabel}>Bench</div>
      {bench.map((sp) => (
        <button key={sp.p.id} className={styles.lineupRow} disabled={sp.p.injury != null} onClick={() => onPickBench(sp.p.id)}>
          <span>{sp.p.lastName}</span>
          <span className={styles.lineupEnergy}><span style={{ width: `${sp.energy * 100}%` }} /></span>
          <span className={styles.lineupPf}>{sp.p.injury ? 'INJ' : ''}</span>
        </button>
      ))}
    </div>
  );
}
