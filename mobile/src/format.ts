// Dates and times shown in US Eastern, which is how the leagues schedule games.
import type { Game } from './types';

const ET = 'America/New_York';

export function gameDay(g: Game): string {
  if (g.start) return new Date(g.start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: ET });
  return (g.dateText || '').split(' at ')[0];
}

export function gameTime(g: Game): string {
  if (g.start) return new Date(g.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: ET }) + ' ET';
  const t = (g.dateText || '').split(' at ')[1];
  return t ? t.toUpperCase() + ' ET' : '';
}

// "NOV 5" for the goals list header.
export function shortDay(g: Game): string {
  if (g.start) return new Date(g.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: ET }).toUpperCase();
  const d = (g.dateText || '').split(' at ')[0];
  return d.replace(/^\w+,\s*/, '').toUpperCase();
}

export function countdown(start: string | null, now = Date.now()) {
  if (!start) return null;
  let s = Math.max(0, Math.floor((+new Date(start) - now) / 1000));
  const days = Math.floor(s / 86400); s -= days * 86400;
  const hrs = Math.floor(s / 3600); s -= hrs * 3600;
  const min = Math.floor(s / 60);
  return { days, hrs, min, sec: s - min * 60 };
}

export const pad = (n: number) => String(n).padStart(2, '0');
