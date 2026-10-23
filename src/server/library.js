// Horn library.
//
// Online layout (default https://goalhorn.colbykordas.com/horns):
//   /<LEAGUE>/<TEAM>/goal.mp3   e.g. /NHL/BOS/goal.mp3
//   /<LEAGUE>/<TEAM>/win.mp3
//   /_generic/<sport>/goal.mp3  sport = hockey | baseball | football
//   /_generic/<sport>/win.mp3
// A missing file is fine; it just means nothing is there for that slot.
//
// On disk (inside the app's data folder):
//   library/cloud/...              cached copies of the online files
//   library/local/NHL_BOS_goal.mp3 files you uploaded (never leave this computer)
//
// Which file plays, per slot:
//   1. your upload for this team
//   2. the online horn for this team
//   3. the online generic horn for this sport
//   4. the built-in horn that ships with the app
const fs = require('fs');
const path = require('path');
const { getBuffer } = require('./net');
const { LEAGUES } = require('../shared/teams');

const TYPES = ['goal', 'win'];
const BUILT_IN = {
  goal: path.join(__dirname, '..', 'assets', 'default-goal.mp3'),
  win: path.join(__dirname, '..', 'assets', 'default-win.mp3'),
};

const clean = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const key = (league, team) => clean(league) + ':' + clean(team);
const sportFor = league => LEAGUES[clean(league)]?.sport || 'hockey';

function usable(file) {
  try { return fs.statSync(file).size > 1000; } catch (e) { return false; }
}

// ID3 tag or an MPEG frame sync at the start.
function isMp3(buf) {
  if (!buf || buf.length < 1000) return false;
  return buf.slice(0, 3).toString('latin1') === 'ID3' || (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0);
}

class Library {
  constructor(dataDir) {
    this.root = path.join(dataDir, 'library');
    this.cloud = path.join(this.root, 'cloud');
    this.local = path.join(this.root, 'local');
    fs.mkdirSync(this.cloud, { recursive: true });
    fs.mkdirSync(this.local, { recursive: true });
  }

  cloudPath(league, team, type) { return path.join(this.cloud, clean(league), clean(team), type + '.mp3'); }
  genericPath(league, type) { return path.join(this.cloud, '_generic', sportFor(league), type + '.mp3'); }

  async download(url, dest) {
    try {
      const buf = await getBuffer(url);
      if (!isMp3(buf)) return 'error';
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest + '.part', buf);
      fs.renameSync(dest + '.part', dest);
      return 'ok';
    } catch (e) {
      return e.status >= 400 && e.status < 500 ? 'missing' : 'error';
    }
  }

  // Fetches whatever this team and sport have online that isn't cached yet.
  // refresh=true re-downloads everything and drops files the library removed.
  async sync(baseUrl, league, team, refresh = false) {
    const base = String(baseUrl || '').replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(base)) return [];
    const jobs = [];
    for (const type of TYPES) {
      for (const [dest, url] of [
        [this.cloudPath(league, team, type), `${base}/${clean(league)}/${clean(team)}/${type}.mp3`],
        [this.genericPath(league, type), `${base}/_generic/${sportFor(league)}/${type}.mp3`],
      ]) {
        if (!refresh && usable(dest)) continue;
        jobs.push(this.download(url, dest).then(result => {
          if (result === 'missing' && refresh) { try { fs.unlinkSync(dest); } catch (e) {} }
          return { url, result };
        }));
      }
    }
    return Promise.all(jobs);
  }

  resolve(league, team, teamHorns) {
    const picks = (teamHorns || {})[key(league, team)] || {};
    const out = {};
    for (const type of TYPES) {
      if (picks[type] && usable(picks[type])) out[type] = { file: picks[type], source: 'upload' };
      else if (usable(this.cloudPath(league, team, type))) out[type] = { file: this.cloudPath(league, team, type), source: 'library' };
      else if (usable(this.genericPath(league, type))) out[type] = { file: this.genericPath(league, type), source: 'generic' };
      else out[type] = { file: BUILT_IN[type], source: 'built-in' };
    }
    return out;
  }

  // Saves an upload and returns its path. Throws if it isn't an MP3.
  saveUpload(league, team, type, buf) {
    if (!isMp3(buf)) throw new Error('That file is not an MP3.');
    const file = path.join(this.local, `${clean(league)}_${clean(team)}_${type}.mp3`);
    fs.writeFileSync(file, buf);
    return file;
  }
}

module.exports = { Library, key, TYPES, isMp3 };
