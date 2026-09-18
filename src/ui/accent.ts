// Derives team-accent CSS colors (bright accent, secondary accent, contrast text)
// from a team's primary/secondary colors, ensuring readable contrast on the dark shell bg.

type Rgb = [number, number, number];

const BG: Rgb = [0x0b, 0x0f, 0x1a];
const FALLBACK_ACCENT = '#19c3d6';
const FALLBACK_ACCENT2 = '#0f7c8a';
const FALLBACK_CONTRAST = '#052226';

export interface AccentTheme { accent: string; accent2: string; accentContrast: string }

function safeHex(hex?: string): Rgb | null {
  if (!hex || !/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) return null;
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
}

function relLuminance([r, g, b]: Rgb): number {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relLuminance(a), lb = relLuminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

function lighten(rgb: Rgb, amt: number): Rgb {
  return rgb.map((c) => c + (255 - c) * amt) as Rgb;
}

function fallback(): AccentTheme {
  return { accent: FALLBACK_ACCENT, accent2: FALLBACK_ACCENT2, accentContrast: FALLBACK_CONTRAST };
}

export function computeAccent(primary?: string, secondary?: string): AccentTheme {
  const p = safeHex(primary);
  const s = safeHex(secondary);
  if (!p && !s) return fallback();
  const a = p ?? s!;
  const b = s ?? p!;
  let [accentRgb, accent2Rgb] = relLuminance(a) >= relLuminance(b) ? [a, b] : [b, a];
  let tries = 0;
  while (contrastRatio(accentRgb, BG) < 3 && tries < 8) {
    accentRgb = lighten(accentRgb, 0.16);
    tries++;
  }
  if (contrastRatio(accentRgb, BG) < 3) return fallback();
  const contrast = contrastRatio(accentRgb, [0, 0, 0]) >= contrastRatio(accentRgb, [255, 255, 255]) ? '#0b0f1a' : '#ffffff';
  return { accent: rgbToHex(accentRgb), accent2: rgbToHex(accent2Rgb), accentContrast: contrast };
}
