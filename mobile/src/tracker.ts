// Watches the selected team's game, keeps a short history of snapshots, and shows
// the scoreboard `delay` seconds behind the live data so it lines up with the TV.
// The automatic horn fires off that delayed view.
//
// Learning the delay: a manual press is someone reacting to the goal on their TV.
// Pair that press with the score change in the data and the gap between the two is
// the delay that makes the scoreboard match the TV.
import { leagues } from './leagues';
import type { SettingsStore } from './settings';
import type { Game } from './types';

// How much a score has to jump to count. NFL uses 6 so field goals, extra points
// and safeties don't sound the horn.
export const THRESHOLD: Record<string, number> = { NFL: 6 };
// A press and a score change this far apart (seconds) count as the same goal.
const MATCH_WINDOW = 180;
// Measured gaps outside this range are thrown out as mismatches.
const MIN_GAP = -30, MAX_GAP = 120;

export interface DelayEvent { measured: number; average: number; applied: number | null; ignored?: boolean }

export interface TrackerView {
  game: Game | null;   // today's game, delayed to match the TV
  next: Game | null;   // the next scheduled game
  last: Game | null;   // the most recent finished game, for the goals list
  error: string | null;
  loading: boolean;
}

type Events = {
  horn: (type: 'goal' | 'win') => void;
  delay: (e: DelayEvent) => void;
  change: (v: TrackerView) => void;
};

interface Snap { at: number; game: Game | null }

export class Tracker {
  private snaps: Snap[] = [];
  private lastPoll = 0;
  private nextAt = 0;
  private lastAt = 0;
  private shown: Game | null = null;
  private changes: { at: number; gameId: Game['id']; used?: boolean }[] = [];
  private presses: { at: number; used?: boolean }[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private gen = 0;
  private handlers: { [K in keyof Events]: Set<Events[K]> } = { horn: new Set(), delay: new Set(), change: new Set() };

  view: TrackerView = { game: null, next: null, last: null, error: null, loading: true };

  constructor(private settings: SettingsStore, private log: (m: string) => void = () => {}) {}

  on<K extends keyof Events>(event: K, fn: Events[K]): () => void {
    this.handlers[event].add(fn);
    return () => { this.handlers[event].delete(fn); };
  }

  private emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>) {
    this.handlers[event].forEach(fn => (fn as (...a: Parameters<Events[K]>) => void)(...args));
  }

  // Forget everything about the old team. Called when the team changes.
  reset() {
    this.gen++;
    this.snaps = [];
    this.lastPoll = this.nextAt = this.lastAt = 0;
    this.shown = null;
    this.changes = [];
    this.presses = [];
    this.view = { game: null, next: null, last: null, error: null, loading: true };
    this.emit('change', this.view);
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1000);
    this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // Poll right away, e.g. when the app comes back to the foreground.
  refresh() {
    this.lastPoll = 0;
    this.tick();
  }

  private get current(): Game | null {
    return this.snaps.length ? this.snaps[this.snaps.length - 1].game : null;
  }

  pollEvery(): number {
    const g = this.current;
    if (g && g.state === 'LIVE') return 5000;
    if (g && g.state === 'FUT' && g.start && +new Date(g.start) - Date.now() < 15 * 60000) return 15000;
    if (g && g.state === 'FUT') return 60000;
    if (g && g.state === 'FINAL' && this.shown && this.shown.state !== 'FINAL') return 5000;
    return 5 * 60000;
  }

  private mine(g: Game) { return g.home.abbrev === this.settings.get().team ? g.home : g.away; }
  private theirs(g: Game) { return g.home.abbrev === this.settings.get().team ? g.away : g.home; }

  async tick() {
    if (this.busy) { this.evaluate(); return; }
    this.busy = true;
    const gen = this.gen;
    const { league, team } = this.settings.get();
    const adapter = leagues[league];
    const now = Date.now();
    try {
      if (now - this.lastPoll >= this.pollEvery()) {
        this.lastPoll = now;
        try {
          const game = await adapter.today(team);
          if (gen !== this.gen) return;
          this.record({ at: Date.now(), game });
          this.view.error = null;
        } catch (e: any) {
          if (gen === this.gen) this.view.error = e?.message || String(e);
        }
        this.view.loading = false;
      }
      if (now - this.nextAt > 10 * 60000) {
        this.nextAt = now;
        try {
          const next = await adapter.next(team);
          if (gen === this.gen) this.view.next = next;
        } catch (e) { /* keep the old value */ }
      }
      // The previous game only matters when today's game hasn't started.
      const today = this.current;
      if ((!today || today.state === 'FUT') && now - this.lastAt > 30 * 60000) {
        this.lastAt = now;
        try {
          const last = await adapter.last(team);
          if (gen === this.gen) this.view.last = last;
        } catch (e) { this.lastAt = now - 25 * 60000; /* try again in 5 minutes */ }
      }
    } finally {
      this.busy = false;
    }
    if (gen === this.gen) this.evaluate();
  }

  // Stores a snapshot and notes when the live data first shows my team scoring.
  record(snap: Snap) {
    const prev = this.current;
    this.snaps.push(snap);
    const g = snap.game;
    if (g && prev && prev.id === g.id && g.state === 'LIVE') {
      const jump = this.mine(g).score - this.mine(prev).score;
      if (jump >= (THRESHOLD[this.settings.get().league] || 1)) {
        this.changes.push({ at: snap.at, gameId: g.id });
        this.match();
      }
    }
    const keep = (Math.max(this.settings.get().delay, MAX_GAP) + 60) * 1000;
    this.snaps = this.snaps.filter((s, i) => i === this.snaps.length - 1 || Date.now() - s.at < keep);
    const old = Date.now() - 10 * 60000;
    this.changes = this.changes.filter(c => c.at > old);
    this.presses = this.presses.filter(p => p.at > old);
  }

  // Called when someone presses the goal horn by hand.
  notePress(at = Date.now()) {
    this.presses.push({ at });
    this.match();
  }

  // Pairs each unused score change with the nearest unused press.
  private match() {
    for (const c of this.changes) {
      if (c.used) continue;
      let best: { p: { at: number; used?: boolean }; gap: number } | null = null;
      for (const p of this.presses) {
        if (p.used) continue;
        const gap = (p.at - c.at) / 1000;
        if (Math.abs(gap) <= MATCH_WINDOW && (!best || Math.abs(gap) < Math.abs(best.gap))) best = { p, gap };
      }
      if (!best) continue;
      c.used = true;
      best.p.used = true;
      this.learn(best.gap);
    }
  }

  private learn(gap: number) {
    const s = this.settings.get();
    const seconds = Math.round(gap);
    if (seconds < MIN_GAP || seconds > MAX_GAP) {
      this.log(`delay: ignored a ${seconds}s gap`);
      this.emit('delay', { measured: seconds, average: 0, applied: null, ignored: true });
      return;
    }
    const history = [...s.delayMeasured, seconds].slice(-3);
    // Average the last few goals so one slow press doesn't swing it.
    const avg = Math.round(history.reduce((a, b) => a + b, 0) / history.length);
    const applied = Math.max(0, avg);
    this.settings.update(s.learnDelay ? { delayMeasured: history, delay: applied } : { delayMeasured: history });
    this.log(`delay: measured ${seconds}s, average ${avg}s`);
    this.emit('delay', { measured: seconds, average: avg, applied: s.learnDelay ? applied : null });
  }

  // The newest snapshot that is at least `delay` seconds old, or the oldest one we have.
  delayed(): Game | null {
    if (!this.snaps.length) return null;
    const cutoff = Date.now() - this.settings.get().delay * 1000;
    let pick = this.snaps[0];
    for (const s of this.snaps) if (s.at <= cutoff) pick = s;
    return pick.game;
  }

  evaluate() {
    const g = this.delayed();
    const prev = this.shown;
    this.shown = g;
    if (g !== this.view.game) {
      this.view = { ...this.view, game: g };
    } else {
      this.view = { ...this.view };
    }
    this.emit('change', this.view);
    if (!g || !prev || prev.id !== g.id) return; // first look at a game sets the baseline
    const { team, league, autoGoal, autoWin } = this.settings.get();
    const jump = this.mine(g).score - this.mine(prev).score;
    if (autoGoal && g.state === 'LIVE' && jump >= (THRESHOLD[league] || 1)) {
      this.log(`auto horn: ${team} ${this.mine(prev).score} -> ${this.mine(g).score}`);
      this.emit('horn', 'goal');
    }
    if (autoWin && prev.state !== 'FINAL' && g.state === 'FINAL' && this.mine(g).score > this.theirs(g).score) {
      this.log(`auto win: ${team} ${this.mine(g).score}-${this.theirs(g).score}`);
      this.emit('horn', 'win');
    }
  }
}
