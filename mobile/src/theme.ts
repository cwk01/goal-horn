// Near-black rink at night; the accent is always the selected team's color.
import type { Team } from './teams';

export const fonts = {
  display: 'RussoOne',
  label: 'BarlowCondensed-SemiBold',
  labelBold: 'BarlowCondensed-Bold',
  name: 'BarlowCondensed-SemiBold',
  body: 'BarlowCondensed-Medium',
  italic: 'BarlowCondensed-MediumItalic',
};

export const base = {
  bg: '#0C0C0D',
  text: '#F2F2F2',
  muted: '#8B8B8F',
  faint: '#4A4A4F',
  line: '#26262A',
  panel: '#151517',
  danger: '#FF7A7A',
};

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (c: number[]) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

// Mix a toward b; t=0 is a, t=1 is b.
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

export function alpha(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Team primaries like navy or black disappear on a near-black screen. Use the
// secondary color when it reads better, otherwise lighten the primary.
export function accentFor(team: Team | null): string {
  if (!team) return '#FCB514';
  const p = team.primary, s = team.secondary;
  if (luminance(p) >= 0.12) return p;
  if (luminance(s) >= 0.12 && luminance(s) < 0.9) return s;
  return mix(p, '#FFFFFF', 0.45);
}

export interface Palette {
  accent: string;
  accentDim: string;    // labels like NEXT GAME
  accentFill: string;   // inside the horn
  cardFill: string;
  cardLine: string;
  onAccent: string;
}

export function paletteFor(team: Team | null): Palette {
  const accent = accentFor(team);
  return {
    accent,
    accentDim: mix(accent, base.bg, 0.35),
    accentFill: mix(accent, base.bg, 0.84),
    cardFill: mix(accent, base.bg, 0.94),
    cardLine: mix(accent, base.bg, 0.78),
    onAccent: luminance(accent) > 0.35 ? '#111111' : '#FFFFFF',
  };
}
