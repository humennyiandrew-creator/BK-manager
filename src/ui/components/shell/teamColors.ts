// The club's uniform for the shell: band colour, trim colour, and readable ink on the band.
type Rgb = [number, number, number];

const CHALK = '#eceae4';

function rgb(hex: string): Rgb | null {
  if (!/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex ?? '')) return null;
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) as Rgb;
}

const lum = ([r, g, b]: Rgb) => {
  const f = (c: number) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Readable ink (near-black or white) for text sitting on a team's primary colour. */
export function teamInk(primary: string): string {
  const p = rgb(primary);
  return p && lum(p) > 0.33 ? '#15171a' : '#ffffff';
}

export interface Uniform { team: string; trim: string; ink: string }

/** Band in the primary colour, trim in the secondary — or chalk when the two would blend together. */
export function uniform(primary: string, secondary: string): Uniform {
  const p = rgb(primary) ?? [58, 63, 71];
  const s = rgb(secondary);
  const team = rgb(primary) ? primary : '#3a3f47';
  const trim = s && contrast(p, s) >= 1.6 ? secondary : CHALK;
  return { team, trim, ink: teamInk(team) };
}
