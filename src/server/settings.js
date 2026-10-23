// Settings live in settings.json inside the app's data folder.
const fs = require('fs');
const path = require('path');
const { LEAGUES, findTeam } = require('../shared/teams');

const DEFAULT_LIBRARY_URL = 'https://horns.colbykordas.com';

const DEFAULTS = {
  league: 'NHL',
  team: 'BOS',
  delay: 30,          // seconds to hold the scoreboard and auto horn back, to match a TV broadcast
  autoGoal: false,    // sound the horn automatically when your team scores (off: timing depends on the data feed)
  autoWin: true,      // sound the win horn automatically when your team wins
  learnDelay: true,   // set the TV delay from manual horn presses
  delayMeasured: [],  // last few measured gaps between the data and the TV, in seconds
  volume: 80,
  playHere: true,     // play on the computer running Goal Horn
  libraryUrl: DEFAULT_LIBRARY_URL,
  teamHorns: {},      // { "NHL:BOS": { goal: "/path/to/upload.mp3" } }
  port: 8787,
  setupDone: false,
};

class Settings {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'settings.json');
    fs.mkdirSync(dir, { recursive: true });
    this.data = { ...DEFAULTS };
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = this.clean({ ...DEFAULTS, ...raw });
    } catch (e) {
      this.data = { ...DEFAULTS };
    }
    return this.data;
  }

  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  clean(d) {
    const out = { ...d };
    if (!LEAGUES[out.league]) out.league = DEFAULTS.league;
    if (!findTeam(out.league, out.team)) out.team = (require('../shared/teams').teams[out.league][0] || {}).abbrev;
    out.delay = clamp(out.delay, 0, 120, DEFAULTS.delay);
    out.volume = clamp(out.volume, 0, 100, DEFAULTS.volume);
    out.port = clamp(out.port, 1024, 65535, DEFAULTS.port);
    for (const k of ['autoGoal', 'autoWin', 'learnDelay', 'playHere', 'setupDone']) out[k] = !!out[k];
    out.delayMeasured = Array.isArray(out.delayMeasured) ? out.delayMeasured.filter(Number.isFinite).slice(-3) : [];
    const u = String(out.libraryUrl || '').trim().replace(/\/+$/, '');
    out.libraryUrl = /^https?:\/\//i.test(u) ? u : DEFAULT_LIBRARY_URL;
    if (!out.teamHorns || typeof out.teamHorns !== 'object') out.teamHorns = {};
    return out;
  }

  // Applies a partial update from the page. Unknown keys are ignored.
  update(patch) {
    const before = this.data;
    const next = { ...before };
    for (const k of Object.keys(DEFAULTS)) if (k !== 'teamHorns' && patch[k] !== undefined) next[k] = patch[k];
    if (patch.league && patch.league !== before.league && patch.team === undefined) next.team = undefined;
    this.data = this.clean(next);
    this.save();
    return { changedTeam: this.data.league !== before.league || this.data.team !== before.team };
  }

  get() { return this.data; }
}

function clamp(v, lo, hi, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
}

module.exports = { Settings, DEFAULTS, DEFAULT_LIBRARY_URL };
