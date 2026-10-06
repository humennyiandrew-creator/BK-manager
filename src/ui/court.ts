// Shared basketball-court canvas rendering. Pure functions, no React — consumers own the
// <canvas> element and call fitCourt() to get a feet-space-scaled 2D context, then draw
// with drawCourt()/drawPlayer()/drawBall() using court coordinates (feet).
// Frame: baseline x=0, basket at (5.25,25), half-court line x=47, sidelines y=0/y=50.

export const COURT_W = 94;
export const COURT_H = 50;
export const HOOP_X = 5.25;
export const HOOP_Y = 25;

export interface Fit { ctx: CanvasRenderingContext2D; scale: number; w: number; h: number }

/** Resizes `canvas` to fill its CSS box at devicePixelRatio while keeping an aw:ah aspect ratio.
 *  Returns a context pre-scaled so all drawing happens directly in feet-space (0..aw, 0..ah). */
export function fitCourt(canvas: HTMLCanvasElement, aw: number, ah: number): Fit {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement?.getBoundingClientRect() ?? canvas.getBoundingClientRect();
  const targetAspect = aw / ah;
  let w = Math.max(1, rect.width), h = w / targetAspect;
  if (h > rect.height && rect.height > 0) { h = rect.height; w = h * targetAspect; }
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d')!;
  const scale = w / aw;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  return { ctx, scale, w, h };
}

interface CourtColors { line: string; wood: string; grain: string }
const BOARD: CourtColors = { line: 'rgba(255,255,255,0.5)', wood: '#1b1e23', grain: 'rgba(255,255,255,0.025)' };
const WOOD_LINE = 'rgba(255,255,255,0.92)';

function drawEnd(ctx: CanvasRenderingContext2D, tint: string | undefined, line: string, lw: number) {
  ctx.lineWidth = lw;
  ctx.strokeStyle = line;
  // lane (16 wide x 19 deep)
  ctx.beginPath();
  ctx.rect(0, 25 - 8, 19, 16);
  if (tint) { ctx.save(); ctx.fillStyle = tint; ctx.fill(); ctx.restore(); }
  ctx.stroke();
  // FT circle r6
  ctx.beginPath(); ctx.arc(19, 25, 6, 0, Math.PI * 2); ctx.stroke();
  // restricted arc r4
  ctx.beginPath(); ctx.arc(HOOP_X, 25, 4, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  // 3pt line: corners at y=3/47 out to ~14ft from baseline, arc r23.75 from hoop
  const r3 = 23.75, cornerY = 3, dy = 25 - cornerY;
  const dx = Math.sqrt(Math.max(0, r3 * r3 - dy * dy));
  const ax = HOOP_X + dx;
  const a0 = Math.atan2(cornerY - 25, ax - HOOP_X);
  const a1 = Math.atan2(50 - cornerY - 25, ax - HOOP_X);
  ctx.beginPath();
  ctx.moveTo(0, cornerY);
  ctx.lineTo(ax, cornerY);
  ctx.arc(HOOP_X, 25, r3, a0, a1);
  ctx.lineTo(0, 50 - cornerY);
  ctx.stroke();
  // backboard
  ctx.beginPath(); ctx.lineWidth = 0.5; ctx.moveTo(4, 22); ctx.lineTo(4, 28); ctx.stroke();
  // hoop
  ctx.beginPath(); ctx.lineWidth = 0.3; ctx.strokeStyle = '#ff7a3d';
  ctx.arc(HOOP_X, 25, 0.75, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = lw; ctx.strokeStyle = line;
}

/** Maple boards running the length of the floor, seams, staggered end joints and a varnish sheen. */
function paintHardwood(g: CanvasRenderingContext2D, w: number, h: number) {
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#cf9a5c');
  base.addColorStop(0.5, '#dcac70');
  base.addColorStop(1, '#cb955a');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const row = 0.62;
  for (let y = 0; y < h; y += row) {
    let x = -rnd() * 10;
    while (x < w) {
      const len = 5 + rnd() * 9;
      const tone = rnd();
      g.fillStyle = tone < 0.5 ? `rgba(120,70,25,${0.05 + tone * 0.12})` : `rgba(255,235,200,${(tone - 0.5) * 0.14})`;
      g.fillRect(x, y, len, row);
      g.fillStyle = 'rgba(70,40,15,0.22)';
      g.fillRect(x + len - 0.03, y, 0.04, row);
      x += len;
    }
    g.fillStyle = 'rgba(70,40,15,0.16)';
    g.fillRect(0, y, w, 0.03);
  }
  const sheen = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w * 0.62);
  sheen.addColorStop(0, 'rgba(255,240,215,0.16)');
  sheen.addColorStop(0.6, 'rgba(255,240,215,0)');
  sheen.addColorStop(1, 'rgba(40,20,5,0.28)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, w, h);
}

export interface CourtOpts {
  /** Paint for the left-hand key / right-hand key. */
  home?: string;
  away?: string;
  /** 'board' is the coach's whiteboard (playbook); 'hardwood' is the home floor (live games). */
  surface?: 'board' | 'hardwood';
  /** Centre-circle paint and crest for the home floor. */
  centre?: string;
  logo?: HTMLImageElement | null;
}

let woodCache: { key: string; canvas: HTMLCanvasElement } | null = null;

function drawLines(ctx: CanvasRenderingContext2D, mode: 'full' | 'half', w: number, h: number, o: CourtOpts, line: string, lw: number) {
  ctx.strokeStyle = line; ctx.lineWidth = lw;
  ctx.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
  if (mode === 'full') {
    ctx.beginPath(); ctx.arc(47, 25, 6, 0, Math.PI * 2);
    if (o.centre) { ctx.save(); ctx.fillStyle = o.centre; ctx.fill(); ctx.restore(); }
    ctx.stroke();
    if (o.logo && o.logo.complete && o.logo.naturalWidth > 0) {
      const size = 8.6, ratio = o.logo.naturalWidth / o.logo.naturalHeight;
      const lw2 = ratio >= 1 ? size : size * ratio, lh = ratio >= 1 ? size / ratio : size;
      ctx.save(); ctx.globalAlpha = 0.92; ctx.drawImage(o.logo, 47 - lw2 / 2, 25 - lh / 2, lw2, lh); ctx.restore();
    }
    ctx.beginPath(); ctx.moveTo(47, 0); ctx.lineTo(47, 50); ctx.stroke();
    ctx.save(); drawEnd(ctx, o.home, line, lw); ctx.restore();
    ctx.save(); ctx.translate(94, 0); ctx.scale(-1, 1); drawEnd(ctx, o.away, line, lw); ctx.restore();
  } else {
    drawEnd(ctx, o.home, line, lw);
  }
}

export function drawCourt(ctx: CanvasRenderingContext2D, mode: 'full' | 'half', o: CourtOpts = {}) {
  const w = mode === 'full' ? COURT_W : COURT_W / 2;
  const h = COURT_H;
  if (o.surface === 'hardwood') {
    // The floor is static for long stretches: render it once per size/paint into an offscreen canvas.
    const px = ctx.getTransform().a;
    const logoKey = o.logo ? `${o.logo.src}|${o.logo.complete && o.logo.naturalWidth > 0}` : '';
    const key = `${mode}|${px.toFixed(3)}|${o.home}|${o.away}|${o.centre}|${logoKey}`;
    if (!woodCache || woodCache.key !== key) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(w * px));
      c.height = Math.max(1, Math.ceil(h * px));
      const g = c.getContext('2d')!;
      g.scale(px, px);
      paintHardwood(g, w, h);
      drawLines(g, mode, w, h, o, WOOD_LINE, 0.17);
      woodCache = { key, canvas: c };
    }
    ctx.drawImage(woodCache.canvas, 0, 0, w, h);
    return;
  }
  ctx.fillStyle = BOARD.wood;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = BOARD.grain;
  ctx.lineWidth = 0.06;
  for (let y = 2; y < h; y += 2.3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  drawLines(ctx, mode, w, h, o, BOARD.line, 0.24);
}

export interface PlayerDrawOpts {
  x: number; y: number; label: string; sub: string; energy: number; fouls: number; fill: string; hasBall: boolean; glow?: number;
  heat?: number; // shooting streak: >0 on fire (3+ makes in a row), <0 ice cold (4+ misses)
  pulse?: number; // 0–1 animation phase for the heat ring
  ink?: string; // jersey number colour on the token
}

export function drawPlayer(ctx: CanvasRenderingContext2D, o: PlayerDrawOpts) {
  const r = 1.4;
  if (o.heat) {
    const hot = o.heat > 0;
    const p = o.pulse ?? 0;
    const grad = ctx.createRadialGradient(o.x, o.y, r * 0.6, o.x, o.y, r + 2.2 + p * 0.5);
    grad.addColorStop(0, hot ? 'rgba(255,120,30,0.0)' : 'rgba(90,190,255,0.0)');
    grad.addColorStop(0.55, hot ? `rgba(255,110,20,${0.35 + p * 0.25})` : `rgba(110,200,255,${0.3 + p * 0.2})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.fillStyle = grad;
    ctx.arc(o.x, o.y, r + 2.2 + p * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (o.glow && o.glow > 0) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(255,210,61,${o.glow * 0.8})`;
    ctx.lineWidth = 0.25 + o.glow * 0.45;
    ctx.arc(o.x, o.y, r + 1.05 + (1 - o.glow) * 0.7, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 0.22;
  ctx.arc(o.x, o.y, r + 0.45, 0, Math.PI * 2); ctx.stroke();
  const ringColor = o.energy > 0.7 ? '#3ddc97' : o.energy > 0.45 ? '#e8b93d' : '#ff4d5e';
  ctx.beginPath();
  ctx.strokeStyle = ringColor; ctx.lineWidth = 0.28; ctx.lineCap = 'round';
  ctx.arc(o.x, o.y, r + 0.45, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, Math.min(1, o.energy)));
  ctx.stroke(); ctx.lineCap = 'butt';

  if (o.hasBall) {
    ctx.beginPath(); ctx.strokeStyle = '#ffd23d'; ctx.lineWidth = 0.2;
    ctx.arc(o.x, o.y, r + 0.85, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.beginPath();
  ctx.fillStyle = o.fill;
  ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 0.09; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();

  ctx.fillStyle = o.ink ?? '#fff';
  ctx.font = '700 1.3px "Archivo Variable", "Archivo", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(o.label, o.x, o.y + 0.06);

  if (o.fouls > 0) {
    const n = Math.min(o.fouls, 6);
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.fillStyle = i >= 5 ? '#ff4d5e' : '#ffb020';
      ctx.arc(o.x - (n - 1) * 0.25 + i * 0.5, o.y + r + 0.55, 0.17, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Name tag: a small dark pill so it reads on a light floor as well as the dark board.
  ctx.font = '600 0.9px "Archivo Variable", "Archivo", sans-serif';
  const ty = o.y + r + (o.fouls > 0 ? 1.55 : 1.1);
  const tw = ctx.measureText(o.sub).width + 0.6;
  ctx.fillStyle = 'rgba(18,19,21,0.72)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(o.x - tw / 2, ty - 0.6, tw, 1.2, 0.3); else ctx.rect(o.x - tw / 2, ty - 0.6, tw, 1.2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(o.sub, o.x, ty + 0.04);
}

/** Fading trail of recent ball positions, drawn before the ball itself. */
export function drawBallTrail(ctx: CanvasRenderingContext2D, trail: { x: number; y: number }[]) {
  const n = trail.length;
  for (let i = 0; i < n - 1; i++) {
    const t = trail[i];
    const alpha = ((i + 1) / n) * 0.22;
    ctx.beginPath();
    ctx.fillStyle = `rgba(232,114,12,${alpha})`;
    ctx.arc(t.x, t.y, 0.38, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, z: number) {
  ctx.beginPath();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.ellipse(x, y, 0.5, 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  const yy = y - z * 0.55;
  const r = 0.5 + Math.min(1, z / 12) * 0.3;
  ctx.beginPath(); ctx.fillStyle = '#e8720c';
  ctx.arc(x, yy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(58,26,0,0.7)'; ctx.lineWidth = 0.05;
  ctx.beginPath(); ctx.moveTo(x - r, yy); ctx.lineTo(x + r, yy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, yy - r); ctx.lineTo(x, yy + r); ctx.stroke();
}

export function drawScreen(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number) {
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 0.45;
  ctx.lineCap = 'round';
  ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/** RGB Euclidean distance between two #hex colors — used to pick a distinguishable away fill. */
export function colorDist(a: string, b: string): number {
  const hex = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ar, ag, ab] = hex(a.replace('#', ''));
  const [br, bg, bb] = hex(b.replace('#', ''));
  return Math.hypot(ar - br, ag - bg, ab - bb);
}
