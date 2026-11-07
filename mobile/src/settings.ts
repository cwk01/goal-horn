// Settings are saved on the phone with AsyncStorage. Same names and limits as the
// desktop app's settings.json, minus the parts that only make sense on a computer.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LEAGUES, LeagueId, findTeam, teams } from './teams';

export const DEFAULT_LIBRARY_URL = 'https://goalhorn.colbykordas.com/horns';
const KEY = 'goal-horn-settings';

export interface Settings {
  league: LeagueId;
  team: string;
  delay: number;            // seconds to hold the scoreboard and auto horn back, to match a TV broadcast
  autoGoal: boolean;        // sound the horn when the data shows your team scoring
  autoWin: boolean;         // sound the win horn when your team wins
  learnDelay: boolean;      // set the TV delay from manual horn presses
  delayMeasured: number[];  // last few measured gaps between the data and the TV
  volume: number;           // 0-100, on top of the phone's media volume
  keepAwake: boolean;       // keep the screen on while a game is on
  libraryUrl: string;
  setupDone: boolean;
}

export const DEFAULTS: Settings = {
  league: 'NHL',
  team: 'BOS',
  delay: 30,
  autoGoal: false,
  autoWin: true,
  learnDelay: true,
  delayMeasured: [],
  volume: 100,
  keepAwake: true,
  libraryUrl: DEFAULT_LIBRARY_URL,
  setupDone: false,
};

const clamp = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
};

export function clean(d: Partial<Settings>): Settings {
  const out = { ...DEFAULTS, ...d } as Settings;
  if (!LEAGUES[out.league]) out.league = DEFAULTS.league;
  if (!findTeam(out.league, out.team)) out.team = teams[out.league][0].abbrev;
  out.delay = clamp(out.delay, 0, 120, DEFAULTS.delay);
  out.volume = clamp(out.volume, 0, 100, DEFAULTS.volume);
  for (const k of ['autoGoal', 'autoWin', 'learnDelay', 'keepAwake', 'setupDone'] as const) out[k] = !!out[k];
  out.delayMeasured = Array.isArray(out.delayMeasured) ? out.delayMeasured.filter(Number.isFinite).slice(-3) : [];
  const u = String(out.libraryUrl || '').trim().replace(/\/+$/, '');
  out.libraryUrl = /^https?:\/\//i.test(u) ? u : DEFAULT_LIBRARY_URL;
  return out;
}

type Listener = (s: Settings, changedTeam: boolean) => void;

export class SettingsStore {
  private data: Settings = { ...DEFAULTS };
  private listeners = new Set<Listener>();

  async load(): Promise<Settings> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      this.data = clean(raw ? JSON.parse(raw) : {});
    } catch (e) {
      this.data = { ...DEFAULTS };
    }
    return this.data;
  }

  get(): Settings {
    return this.data;
  }

  update(patch: Partial<Settings>): { changedTeam: boolean } {
    const before = this.data;
    const next: Partial<Settings> = { ...before, ...patch };
    // Switching league without a team picks that league's first team.
    if (patch.league && patch.league !== before.league && patch.team === undefined) next.team = '';
    this.data = clean(next);
    const changedTeam = this.data.league !== before.league || this.data.team !== before.team;
    AsyncStorage.setItem(KEY, JSON.stringify(this.data)).catch(() => {});
    this.listeners.forEach(l => l(this.data, changedTeam));
    return { changedTeam };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
}
