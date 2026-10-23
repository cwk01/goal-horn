// Watches the selected team's game, keeps a short history of snapshots, and
// serves the scoreboard "delay" seconds behind live so it lines up with TV.
// The auto horn fires off that delayed view, so the horn and the TV match.
const { EventEmitter } = require('events');
const leagues = require('./leagues');

// How much a score has to jump to count as a goal/run/touchdown.
// NFL uses 6 so field goals, extra points and safeties don't sound the horn.
const THRESHOLD = { NFL: 6 };

class Tracker extends EventEmitter {
  constructor(settings, log = () => {}) {
    super();
    this.settings = settings;
    this.log = log;
    this.reset();
    this.timer = null;
  }

  reset() {
    this.snaps = [];          // [{ at, game }]
    this.lastPoll = 0;
    this.next = null;
    this.nextAt = 0;
    this.shown = null;        // last delayed game we evaluated
    this.error = null;
    this.forceWin = false;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch(e => this.log('tracker: ' + e.message)), 2000);
    this.tick().catch(() => {});
  }

  stop() { clearInterval(this.timer); this.timer = null; }

  get current() { return this.snaps.length ? this.snaps[this.snaps.length - 1].game : null; }

  pollEvery() {
    const g = this.current;
    if (g && g.state === 'LIVE') return 10000;
    if (g && g.state === 'FUT' && g.start && new Date(g.start) - Date.now() < 15 * 60000) return 15000;
    if (g && g.state === 'FUT') return 60000;
    if (g && g.state === 'FINAL' && this.shown && this.shown.state !== 'FINAL') return 10000;
    return 5 * 60000;
  }

  async tick() {
    const { league, team } = this.settings.get();
    const now = Date.now();
    if (now - this.lastPoll >= this.pollEvery()) {
      this.lastPoll = now;
      try {
        const game = await leagues[league].today(team);
        this.snaps.push({ at: Date.now(), game });
        this.error = null;
      } catch (e) {
        this.error = e.message;
      }
      const keep = (this.settings.get().delay + 60) * 1000;
      this.snaps = this.snaps.filter((s, i) => i === this.snaps.length - 1 || Date.now() - s.at < keep);
    }
    if (now - this.nextAt > 10 * 60000) {
      this.nextAt = now;
      try { this.next = await leagues[league].next(team); } catch (e) { /* keep the old value */ }
    }
    this.evaluate();
  }

  // The newest snapshot that is at least `delay` seconds old, or the oldest one we have.
  delayed() {
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
    if (!g || !prev || prev.id !== g.id) return;      // first look at a game sets the baseline
    const { team, league, autoGoal, autoWin } = this.settings.get();
    const mine = x => (x.home.abbrev === team ? x.home : x.away);
    const theirs = x => (x.home.abbrev === team ? x.away : x.home);
    const jump = mine(g).score - mine(prev).score;
    if (autoGoal && g.state === 'LIVE' && jump >= (THRESHOLD[league] || 1)) {
      this.log(`auto horn: ${team} ${mine(prev).score} -> ${mine(g).score}`);
      this.emit('horn', 'goal');
    }
    if (autoWin && prev.state !== 'FINAL' && g.state === 'FINAL' && mine(g).score > theirs(g).score) {
      this.log(`auto win: ${team} ${mine(g).score}-${theirs(g).score}`);
      this.emit('horn', 'win');
    }
  }
}

module.exports = { Tracker, THRESHOLD };
