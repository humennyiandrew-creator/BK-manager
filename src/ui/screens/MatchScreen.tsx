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
import BkImage from '../components/BkImage';
import { COURT_W, COURT_H, colorDist, drawBall, drawCourt, drawPlayer, drawScreen, fitCourt } from '../court';
import styles from './MatchScreen.module.css';

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

type RightTab = 'pbp' | 'box' | 'tactics' | 'lineup';

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !match || !s || !game) return;
    const home = s.teams[game.home], away = s.teams[game.away];
    const homeColor = home.colors.primary;
    const awayColor = colorDist(home.colors.primary, away.colors.primary) < 60 ? away.colors.secondary : away.colors.primary;
    const fillOf = (side: 0 | 1) => (side === 0 ? homeColor : awayColor);

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
      const ctx = fit.ctx;
      ctx.clearRect(0, 0, COURT_W, COURT_H);
      drawCourt(ctx, 'full', { home: hexAlpha(homeColor, 0.08), away: hexAlpha(awayColor, 0.08) });
      for (const [aId, bId] of snap.screens) {
        const a = snap.players.find((p) => p.id === aId), b = snap.players.find((p) => p.id === bId);
        if (a && b) drawScreen(ctx, a.x, a.y, b.x, b.y);
      }
      for (const p of snap.players) {
        drawPlayer(ctx, { x: p.x, y: p.y, label: p.jersey, sub: p.name, energy: p.energy, fouls: p.fouls, fill: fillOf(p.side), hasBall: p.ball });
      }
      if (snap.state !== 'pregame') drawBall(ctx, snap.ball.x, snap.ball.y, snap.ball.z);

      if (now - lastUi > 120) { lastUi = now; setTick((t) => t + 1); }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

  if (!s || !game || !match) return null;

  const home = s.teams[game.home], away = s.teams[game.away];
  const userSide = match.userSide ?? 0;
  const userTeamState = s.teams[s.userTeamId];
  const userSideObj: Side = userSide === 0 ? match.H : match.A;
  const snap: Snapshot = match.snapshot();
  const maxTo = snap.period >= 3 ? 4 : 7;

  function handleTipOff() { match!.start(); }
  function handleQuickSim() {
    mutate((st) => continueGame(st));
    void save();
    clearMatch();
    setView('shell');
  }
  function handleContinueFinal() {
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

      <div className={styles.main}>
        <div className={styles.courtWrap}>
          <canvas ref={canvasRef} />
          {snap.state === 'pregame' && (
            <Overlay>
              <div className={styles.pregameRow}>
                <TeamBig team={home} />
                <span className={styles.vs}>VS</span>
                <TeamBig team={away} />
              </div>
              <div className={styles.overlayBtns}>
                <button className={styles.primaryBtn} onClick={handleTipOff}>Tip-Off</button>
                <button className={styles.secondaryBtn} onClick={handleQuickSim}>Quick Sim</button>
              </div>
            </Overlay>
          )}
          {snap.state === 'timeout' && (
            <Overlay>
              <div className={styles.overlayTitle}>{(snap.pbp.at(-1)?.text ?? 'TIMEOUT').toUpperCase()}</div>
              <div className={styles.overlayHint}>Adjust Tactics or Lineup, then resume.</div>
              <button className={styles.primaryBtn} onClick={() => match!.resume()}>Resume</button>
            </Overlay>
          )}
          {snap.state === 'break' && (
            <Overlay>
              <div className={styles.overlayTitle}>{snap.period <= 4 && snap.period === 3 ? 'Halftime' : `End of ${periodLabel(snap.period - 1)}`}</div>
              <LineScore snap={snap} home={home} away={away} />
              <button className={styles.primaryBtn} onClick={() => match!.resume()}>Resume Now</button>
            </Overlay>
          )}
          {snap.state === 'final' && (
            <Overlay wide>
              <div className={styles.overlayTitle}>FINAL — {home.abbr} {snap.score[0]} · {snap.score[1]} {away.abbr}</div>
              <LineScore snap={snap} home={home} away={away} />
              <div className={styles.topPerfRow}>
                <TopPerformers side={match.H} />
                <TopPerformers side={match.A} />
              </div>
              <button className={styles.primaryBtn} onClick={handleContinueFinal}>Continue</button>
            </Overlay>
          )}
        </div>

        <div className={styles.rightPanel}>
          <div className={styles.tabsRow}>
            {(['pbp', 'box', 'tactics', 'lineup'] as RightTab[]).map((t) => (
              <button key={t} className={t === rightTab ? `${styles.tab} ${styles.tabActive}` : styles.tab} onClick={() => setRightTab(t)}>
                {{ pbp: 'Play-by-Play', box: 'Box Score', tactics: 'Tactics', lineup: 'Lineup' }[t]}
              </button>
            ))}
          </div>
          <div className={styles.tabBody}>
            {rightTab === 'pbp' && <PbpTab pbp={snap.pbp} home={home.colors.primary} away={away.colors.primary} />}
            {rightTab === 'box' && <BoxTab home={match.H} away={match.A} homeAbbr={home.abbr} awayAbbr={away.abbr} />}
            {rightTab === 'tactics' && (
              <TacticsTab
                tactics={userTeamState.tactics}
                roster={userSideObj.roster}
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
  return (
    <div className={styles.scoreboard}>
      <TeamScore team={home} score={snap.score[0]} bonus={snap.bonus[0]} timeouts={snap.timeouts[0]} maxTo={maxTo} possession={snap.possession === 0} align="left" />
      <div className={styles.sbCenter}>
        <div className={styles.sbPeriod}>{periodLabel(snap.period)}</div>
        <div className={styles.sbClock}>{fmtClock(snap.clock)}</div>
        <div className={styles.sbShotClock}>{snap.state === 'live' ? Math.ceil(snap.shotClock) : '--'}</div>
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
      <span className={styles.sbScore}>{score}</span>
      {align === 'right' && <BkImage path={team.logo} alt={team.abbr} className={styles.sbLogo} />}
    </div>
  );
}

function TeamBig({ team }: { team: any }) {
  return (
    <div className={styles.teamBig}>
      <BkImage path={team.logo} alt={team.abbr} className={styles.teamBigLogo} />
      <div className={styles.teamBigName}>{team.city} {team.name}</div>
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

function TopPerformers({ side }: { side: Side }) {
  const top = [...side.roster].sort((a, b) => b.line.pts - a.line.pts).slice(0, 3);
  return (
    <div className={styles.topPerfCol}>
      <div className={styles.topPerfTeam}>{side.team.abbr}</div>
      {top.map((sp) => (
        <div key={sp.p.id} className={styles.topPerfRow2}>
          <span>{sp.p.lastName}</span>
          <span>{sp.line.pts} pts · {sp.line.orb + sp.line.drb} reb · {sp.line.ast} ast</span>
        </div>
      ))}
    </div>
  );
}

function Overlay({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={styles.overlayBackdrop}>
      <div className={wide ? `${styles.overlayPanel} ${styles.overlayPanelWide}` : styles.overlayPanel}>{children}</div>
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
  { key: 'fg', label: 'FG', render: (sp) => `${sp.line.fgm}-${sp.line.fga}` },
  { key: 'tp', label: '3P', render: (sp) => `${sp.line.tpm}-${sp.line.tpa}` },
  { key: 'ft', label: 'FT', render: (sp) => `${sp.line.ftm}-${sp.line.fta}` },
  { key: 'pf', label: 'PF', render: (sp) => String(sp.line.pf) },
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

function TacticsTab({ tactics, roster, onOffense, onDefense, onSlider, onFocus, onClutch, calledPlay, onCalledPlayChange, onCallPlay }: any) {
  return (
    <div className={styles.tacticsWrap}>
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
        <label>Focus Player</label>
        <select value={tactics.focusPlayer ?? ''} onChange={(e) => onFocus(e.target.value)}>
          <option value="">None</option>
          {roster.map((sp: SP) => <option key={sp.p.id} value={sp.p.id}>{sp.p.lastName}</option>)}
        </select>
      </div>
      <div className={styles.tField}>
        <label>Clutch Play</label>
        <select value={tactics.clutchPlay ?? ''} onChange={(e) => onClutch(e.target.value)}>
          <option value="">Auto</option>
          {PLAYS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className={styles.tField}>
        <label>Call Next Possession</label>
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
      <div className={styles.lineupLabel}>On Court</div>
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
