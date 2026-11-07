// Joined mode: the phone follows a Goal Horn computer (desktop app or Docker) on the
// same Wi-Fi. The computer tracks the game and decides when the horn sounds; the phone
// shows its scoreboard, presses its horn, and plays along as one of its speakers.
import { describe, ping, scan, type Found } from './discover';
import { leagues } from './leagues';
import { EventStream } from './sse';
import type { LeagueId } from './teams';
import type { TrackerView, DelayEvent } from './tracker';
import type { HornType } from './library';

export interface RemoteSettings {
  league: LeagueId;
  team: string;
  delay: number;
  autoGoal: boolean;
  autoWin: boolean;
  learnDelay: boolean;
  delayMeasured: number[];
}

export const REMOTE_KEYS = ['league', 'team', 'delay', 'autoGoal', 'autoWin', 'learnDelay'] as const;

export type LinkStatus = 'connecting' | 'connected' | 'lost';

type Events = {
  change: () => void;
  play: (type: HornType, uri: string, volume: number) => void;
  stop: () => void;
  delay: (e: DelayEvent) => void;
  moved: (f: Found) => void; // the computer answered at a new address; save it
};

export class Remote {
  status: LinkStatus = 'connecting';
  problem = '';
  settings: RemoteSettings | null = null;
  view: TrackerView = { game: null, next: null, last: null, error: null, loading: true };
  playing: HornType | null = null;

  private stream: EventStream | null = null;
  private clientId: number | null = null;
  private gameTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private playingTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAt = 0;
  private lastKey = '';
  private running = false;
  private finding = false;
  private handlers: { [K in keyof Events]: Set<Events[K]> } = { change: new Set(), play: new Set(), stop: new Set(), delay: new Set(), moved: new Set() };

  constructor(public found: Found, private speaker: () => { name: string; playHere: boolean }) {}

  on<K extends keyof Events>(event: K, fn: Events[K]): () => void {
    this.handlers[event].add(fn);
    return () => { this.handlers[event].delete(fn); };
  }

  private emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>) {
    this.handlers[event].forEach(fn => (fn as (...a: Parameters<Events[K]>) => void)(...args));
  }

  private get base() { return this.found.base.replace(/\/+$/, ''); }

  start() {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop() {
    this.running = false;
    this.stream?.close();
    this.stream = null;
    if (this.gameTimer) clearInterval(this.gameTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.gameTimer = this.retryTimer = null;
  }

  // Back in the foreground: reconnect right away instead of waiting out a retry.
  wake() {
    if (!this.running) return;
    if (this.status !== 'connected') { if (this.retryTimer) clearTimeout(this.retryTimer); this.connect(); }
    else this.pollGame();
  }

  private set(status: LinkStatus, problem = '') {
    this.status = status;
    this.problem = problem;
    this.emit('change');
  }

  // Try the address that worked last, then every address the computer listed,
  // then scan the network for the same computer in case the router gave it a new IP.
  private async connect() {
    if (!this.running || this.finding) return;
    this.finding = true;
    if (this.status !== 'lost') this.set('connecting');
    try {
      const tries = [this.base, ...this.found.urls.filter(u => u.replace(/\/+$/, '') !== this.base)];
      for (const b of tries) {
        if ((await ping(b, 2000)) === this.found.id) { await this.attach(b); return; }
      }
      const hit = (await scan({ want: this.found.id }).catch(() => [])).find(f => f.id === this.found.id);
      if (hit) { await this.attach(hit.base); return; }
      this.set('lost', `Can't find ${this.found.label} on this Wi-Fi. Is Goal Horn open on it?`);
      this.retry(15000);
    } finally {
      this.finding = false;
    }
  }

  private retry(ms: number) {
    if (!this.running) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), ms);
  }

  private async attach(base: string) {
    if (!this.running) return;
    const moved = base.replace(/\/+$/, '') !== this.base;
    this.found = await describe(base, this.found.id);
    if (moved) this.emit('moved', this.found);
    await this.loadState();
    const { name } = this.speaker();
    this.stream?.close();
    this.stream = new EventStream(
      `${this.base}/events?role=speaker&name=${encodeURIComponent(name)}`,
      (ev, data) => this.onEvent(ev, data),
      () => {},
      why => {
        this.clientId = null;
        this.set('lost', `Lost ${this.found.label} (${why}). Reconnecting.`);
        this.retry(3000);
      },
    );
    this.stream.open();
    if (this.gameTimer) clearInterval(this.gameTimer);
    this.gameTimer = setInterval(() => this.pollGame(), 3000);
    this.pollGame();
  }

  private onEvent(ev: string, data: any) {
    if (ev === 'hello') {
      this.clientId = Number(data.id);
      this.set('connected');
      this.announce();
    } else if (ev === 'play') {
      const type: HornType = data.type === 'win' ? 'win' : 'goal';
      this.markPlaying(type);
      if (this.speaker().playHere) this.emit('play', type, this.base + data.src, Number(data.volume ?? 100));
    } else if (ev === 'stop') {
      this.markPlaying(null);
      this.emit('stop');
    } else if (ev === 'state') {
      this.applyState(data);
    } else if (ev === 'delay') {
      this.emit('delay', { measured: data.measured, average: data.average, applied: data.applied ?? null });
      if (this.settings && Number.isFinite(data.delay)) { this.settings = { ...this.settings, delay: data.delay }; this.emit('change'); }
    }
  }

  // The computer's horn has no end event, so show it as playing for a few seconds.
  private markPlaying(type: HornType | null) {
    if (this.playingTimer) clearTimeout(this.playingTimer);
    this.playing = type;
    if (type) this.playingTimer = setTimeout(() => { this.playing = null; this.emit('change'); }, 12000);
    this.emit('change');
  }

  // Tells the computer whether this phone is a speaker and what to call it.
  announce() {
    if (this.clientId == null) return;
    const { name, playHere } = this.speaker();
    this.post('/api/ready', { id: this.clientId, ready: playHere, name }).catch(() => {});
  }

  private applyState(s: any) {
    const st = s?.settings;
    if (!st) return;
    this.settings = {
      league: st.league, team: st.team, delay: st.delay, autoGoal: !!st.autoGoal, autoWin: !!st.autoWin,
      learnDelay: !!st.learnDelay, delayMeasured: Array.isArray(st.delayMeasured) ? st.delayMeasured : [],
    };
    this.emit('change');
  }

  private async loadState() {
    const res = await this.fetch('/api/state');
    this.applyState(await res.json());
  }

  private async pollGame() {
    if (!this.running || this.status === 'lost') return;
    try {
      const j = await (await this.fetch('/api/game')).json();
      this.view = { ...this.view, game: j.game || null, next: j.next || null, error: j.error || null, loading: false };
      this.emit('change');
      this.loadLast();
    } catch (e) { /* the live channel notices a dead link */ }
  }

  // The computer doesn't keep the previous game's goals, so the phone looks them up.
  private async loadLast() {
    const s = this.settings;
    if (!s) return;
    const key = s.league + ':' + s.team;
    const g = this.view.game;
    if (g && g.state !== 'FUT') return;
    if (key === this.lastKey && Date.now() - this.lastAt < 30 * 60000) return;
    this.lastKey = key;
    this.lastAt = Date.now();
    try {
      const last = await leagues[s.league].last(s.team);
      if (this.settings && this.settings.league + ':' + this.settings.team === key) { this.view = { ...this.view, last }; this.emit('change'); }
    } catch (e) { this.lastAt = Date.now() - 25 * 60000; }
  }

  private fetch(path: string, init?: RequestInit): Promise<Response> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    return fetch(this.base + path, { ...init, signal: ctl.signal })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r; })
      .finally(() => clearTimeout(t));
  }

  private post(path: string, body: unknown) {
    return this.fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  // The computer plays it everywhere, this phone included, and learns the TV delay from it.
  async press(type: HornType = 'goal') {
    await this.post('/api/horn', { type, from: 'phone' });
  }

  async silence() {
    await this.post('/api/stop', {});
  }

  // Plays the horn on this phone only, to check it can be heard.
  async test() {
    if (this.clientId == null) throw new Error('Not connected yet.');
    await this.post('/api/test', { id: this.clientId });
  }

  async update(patch: Partial<RemoteSettings>) {
    const res = await this.post('/api/settings', patch);
    this.applyState(await res.json());
    if (patch.league || patch.team) { this.view = { game: null, next: null, last: null, error: null, loading: true }; this.lastKey = ''; this.pollGame(); }
  }
}
