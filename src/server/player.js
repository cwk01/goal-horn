// Sound-card playback for headless installs (a Raspberry Pi, a home server).
// The desktop app doesn't use this; its own window plays the horn.
const { spawn, spawnSync } = require('child_process');

const CANDIDATES = {
  linux: [['mpg123', f => ['-q', f]], ['ffplay', f => ['-nodisp', '-autoexit', '-loglevel', 'quiet', f]], ['paplay', f => [f]]],
  darwin: [['afplay', f => [f]]],
  win32: [],
};

function find() {
  for (const [cmd, args] of CANDIDATES[process.platform] || []) {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd]);
    if (r.status === 0) return { cmd, args };
  }
  return null;
}

class Player {
  constructor(log = () => {}) {
    this.log = log;
    this.tool = find();
    this.child = null;
  }

  get available() { return !!this.tool; }

  play(file, volume = 100) {
    if (!this.tool) return false;
    this.stop();
    let args = this.tool.args(file);
    if (this.tool.cmd === 'mpg123') args = ['-q', '-f', String(Math.round(32768 * volume / 100)), file];
    this.child = spawn(this.tool.cmd, args, { stdio: 'ignore' });
    this.child.on('error', e => this.log('player: ' + e.message));
    return true;
  }

  stop() {
    if (this.child && this.child.exitCode === null) this.child.kill('SIGTERM');
    this.child = null;
  }
}

module.exports = { Player };
