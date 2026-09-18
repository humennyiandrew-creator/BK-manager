import { useEffect, useRef } from 'react';
import type { Play, Role, Spot } from '../../engine/playbook/types';
import { drawCourt, drawPlayer, drawScreen, fitCourt } from '../court';
import styles from './PlayDiagram.module.css';

const ROLES: Role[] = [1, 2, 3, 4, 5];

function buildCheckpoints(play: Play): Record<Role, Spot>[] {
  const cps: Record<Role, Spot>[] = [{ ...play.start }];
  let cur: Record<Role, Spot> = { ...play.start };
  for (const st of play.steps) {
    const next = { ...cur };
    for (const [r, sp] of Object.entries(st.move ?? {})) next[Number(r) as Role] = sp!;
    cps.push(next);
    cur = next;
  }
  return cps;
}

export default function PlayDiagram({ play }: { play: Play }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current!;
    let fit = fitCourt(canvas, 47, 50);
    const ro = new ResizeObserver(() => { fit = fitCourt(canvas, 47, 50); });
    ro.observe(canvas.parentElement!);

    const cps = buildCheckpoints(play);
    const durs = play.steps.map((s) => Math.max(0.4, s.t));
    const total = durs.reduce((a, b) => a + b, 0) || 1;
    let holder: Role = 1;
    const segHolder: Role[] = [];
    const segPass: (Role | null)[] = [];
    for (const st of play.steps) { segHolder.push(holder); segPass.push(st.pass ?? null); if (st.pass) holder = st.pass; }

    const start = performance.now();
    const PAUSE = 1.1; // beat held at loop restart so the set is readable

    function frame(now: number) {
      const ctx = fit.ctx;
      ctx.clearRect(0, 0, 47, 50);
      drawCourt(ctx, 'half', { home: 'rgba(25,195,214,0.06)' });

      let el = ((now - start) / 1000) % (total + PAUSE);
      let segI = 0, k = 0;
      if (el <= PAUSE) { segI = 0; k = 0; }
      else {
        el -= PAUSE;
        let acc = 0;
        for (let i = 0; i < durs.length; i++) {
          if (el < acc + durs[i] || i === durs.length - 1) { segI = i; k = Math.min(1, (el - acc) / durs[i]); break; }
          acc += durs[i];
        }
      }
      const from = cps[segI], to = cps[segI + 1] ?? cps[segI];
      const pos: Record<Role, Spot> = {} as Record<Role, Spot>;
      for (const r of ROLES) pos[r] = { x: from[r].x + (to[r].x - from[r].x) * k, y: from[r].y + (to[r].y - from[r].y) * k };

      const step = play.steps[segI];
      if (step?.screen) {
        const [a, b] = step.screen;
        drawScreen(ctx, pos[a].x, pos[a].y, pos[b].x, pos[b].y);
      }
      if (segPass[segI] != null) {
        const to2 = segPass[segI]!;
        ctx.save();
        ctx.setLineDash([0.5, 0.4]);
        ctx.strokeStyle = 'rgba(255,210,61,0.8)';
        ctx.lineWidth = 0.18;
        ctx.beginPath();
        ctx.moveTo(pos[segHolder[segI]].x, pos[segHolder[segI]].y);
        ctx.lineTo(pos[to2].x, pos[to2].y);
        ctx.stroke();
        ctx.restore();
      }

      for (const r of ROLES) {
        drawPlayer(ctx, {
          x: pos[r].x, y: pos[r].y, label: String(r), sub: '', energy: 1, fouls: 0,
          fill: r === 1 ? '#19c3d6' : '#3a4a6b', hasBall: (el <= PAUSE ? 1 : segHolder[segI]) === r
        });
      }
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(rafRef.current!); ro.disconnect(); };
  }, [play]);

  return (
    <div className={styles.wrap}>
      <canvas ref={canvasRef} />
    </div>
  );
}
