// Watches the selected team's game, keeps a short history of snapshots, and
// serves the scoreboard `delay` seconds behind the live data so it lines up with TV.
// The automatic horn fires off that delayed view.
//
// Learning the delay: when someone presses the horn by hand, they are reacting to
// the goal on their TV. Pair that press with the score change in the data and the
// gap between the two is the delay that makes the scoreboard match the TV.
const { EventEmitter } = require('events');
const leagues = require('./leagues');

// How much a score has to jump to count as a goal/run/touchdown.
// NFL uses 6 so field goals, extra points and safeties don't sound the horn.
const THRESHOLD = { NFL: 6 };
// A press and a score change this far apart (seconds) are treated as the same goal.
const MATCH_WINDOW = 180;
// Measured gaps outside this range are thrown out as mismatches.
const MIN_GAP = -30, MAX_GAP = 120;

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
    this.changes = [];        // [{ at, gameId, score }] when the data showed my team scoring
    this.presses = [];        // [{ at }] manual horn presses
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch(e => this.log('tracker: ' + e.message)), 1000);
    this.tick().catch(() => {});
  }

  stop() { clearInterval(this.timer); this.timer = null; }

  get current() { return this.snaps.length ? this.snaps[this.snaps.length - 1].game : null; }

  pollEvery() {
    const g = this.current;
    if (g && g.state === 'LIVE') return 5000;
    if (g && g.state === 'FUT' && g.start && new Date(g.start) - Date.now() < 15 * 60000) return 15000;
    if (g && g.state === 'FUT') return 60000;
    if (g && g.state === 'FINAL' && this.shown && this.shown.state !== 'FINAL') return 5000;
    return 5 * 60000;
  }

  mine(g) { return g.home.abbrev === this.settings.get().team ? g.home : g.away; }
  theirs(g) { return g.home.abbrev === this.settings.get().team ? g.away : g.home; }

  async tick() {
    const { league, team } = this.settings.get();
    const now = Date.now();
    if (now - this.lastPoll >= this.pollEvery()) {
      this.lastPoll = now;
      try {
        const game = await leagues[league].today(team);
        this.record({ at: Date.now(), game });
        this.error = null;
      } catch (e) {
        this.error = e.message;
      }
    }
    if (now - this.nextAt > 10 * 60000) {
      this.nextAt = now;
      try { this.next = await leagues[league].next(team); } catch (e) { /* keep the old value */ }
    }
    this.evaluate();
  }

  // Stores a snapshot and notes when the live data first shows my team scoring.
  record(snap) {
    const prev = this.current;
    this.snaps.push(snap);
    const g = snap.game;
    if (g && prev && prev.id === g.id && g.state === 'LIVE') {
      const jump = this.mine(g).score - this.mine(prev).score;
      if (jump >= (THRESHOLD[this.settings.get().league] || 1)) {
        this.changes.push({ at: snap.at, gameId: g.id, score: this.mine(g).score });
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
    this.presses.push({ at, used: false });
    this.match();
  }

  // Pairs each unused score change with the nearest unused press.
  match() {
    for (const c of this.changes) {
      if (c.used) continue;
      let best = null;
      for (const p of this.presses) {
        if (p.used) continue;
        const gap = (p.at - c.at) / 1000;
        if (Math.abs(gap) <= MATCH_WINDOW && (!best || Math.abs(gap) < Math.abs(best.gap))) best = { p, gap };
      }
      if (!best) continue;
      c.used = true; best.p.used = true;
      this.learn(best.gap);
    }
  }

  learn(gap) {
    const s = this.settings.get();
    const seconds = Math.round(gap);
    if (seconds < MIN_GAP || seconds > MAX_GAP) { this.log(`delay: ignored a ${seconds}s gap`); return; }
    const history = [...(s.delayMeasured || []), seconds].slice(-3);
    // Average the last few goals so one slow press doesn't swing it.
    const avg = Math.round(history.reduce((a, b) => a + b, 0) / history.length);
    const applied = Math.max(0, avg);
    const patch = { delayMeasured: history };
    if (s.learnDelay) patch.delay = applied;
    this.settings.update(patch);
    this.log(`delay: measured ${seconds}s, average ${avg}s` + (s.learnDelay ? `, now ${applied}s` : ''));
    this.emit('delay', { measured: seconds, average: avg, applied: s.learnDelay ? applied : null, tvAhead: avg < 0 });
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

module.exports = { Tracker, THRESHOLD };
