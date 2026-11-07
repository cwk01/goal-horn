// Horn library, same layout and order as the desktop app.
//
// Online (default https://goalhorn.colbykordas.com/horns):
//   /<LEAGUE>/<TEAM>/goal.mp3, /<LEAGUE>/<TEAM>/win.mp3
//   /_generic/<sport>/goal.mp3, /_generic/<sport>/win.mp3
//
// On the phone, in the app's document folder:
//   library/cloud/...             cached copies of the online files
//   library/local/NHL_BOS_goal.mp3 files picked from the phone (never uploaded anywhere)
//
// Which file plays: your pick for this team, then the team's library horn,
// then the generic horn for the sport, then the horn built into the app.
import { Directory, File, Paths } from 'expo-file-system';
import { getBytes, HttpError } from './net';
import { LEAGUES, LeagueId } from './teams';

export type HornType = 'goal' | 'win';
export const TYPES: HornType[] = ['goal', 'win'];
export type HornSource = 'yours' | 'library' | 'generic' | 'built-in';

export const BUILT_IN: Record<HornType, number> = {
  goal: require('../assets/default-goal.mp3'),
  win: require('../assets/default-win.mp3'),
};

export interface Resolved { source: HornSource; uri: string | null } // uri null = built-in asset

const clean = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const sportFor = (league: LeagueId) => LEAGUES[league]?.sport || 'hockey';

// ID3 tag or an MPEG frame sync at the start.
export function isMp3(buf: Uint8Array): boolean {
  if (!buf || buf.length < 1000) return false;
  return (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
}

function usable(f: File): boolean {
  try { return f.exists && f.size > 1000; } catch (e) { return false; }
}

function ensureDir(d: Directory) {
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
}

export class Library {
  private root = new Directory(Paths.document, 'library');
  private cloud = new Directory(this.root, 'cloud');
  private local = new Directory(this.root, 'local');

  constructor() {
    ensureDir(this.cloud);
    ensureDir(this.local);
  }

  private cloudFile(league: LeagueId, team: string, type: HornType) {
    return new File(this.cloud, clean(league), clean(team), type + '.mp3');
  }
  private genericFile(league: LeagueId, type: HornType) {
    return new File(this.cloud, '_generic', sportFor(league), type + '.mp3');
  }
  private localFile(league: LeagueId, team: string, type: HornType) {
    return new File(this.local, `${clean(league)}_${clean(team)}_${type}.mp3`);
  }

  private async download(url: string, dest: File): Promise<'ok' | 'missing' | 'error'> {
    try {
      const buf = await getBytes(url);
      if (!isMp3(buf)) return 'error';
      ensureDir(dest.parentDirectory);
      dest.write(buf);
      return 'ok';
    } catch (e) {
      return e instanceof HttpError && e.status >= 400 && e.status < 500 ? 'missing' : 'error';
    }
  }

  // Fetches whatever this team and sport have online that isn't cached yet.
  // refresh re-downloads everything and drops files the library removed.
  async sync(baseUrl: string, league: LeagueId, team: string, refresh = false) {
    const base = String(baseUrl || '').replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(base)) return [];
    const jobs: Promise<{ url: string; result: string }>[] = [];
    for (const type of TYPES) {
      const pairs: [File, string][] = [
        [this.cloudFile(league, team, type), `${base}/${clean(league)}/${clean(team)}/${type}.mp3`],
        [this.genericFile(league, type), `${base}/_generic/${sportFor(league)}/${type}.mp3`],
      ];
      for (const [dest, url] of pairs) {
        if (!refresh && usable(dest)) continue;
        jobs.push(this.download(url, dest).then(result => {
          if (result === 'missing' && refresh && dest.exists) { try { dest.delete(); } catch (e) { /* ignore */ } }
          return { url, result };
        }));
      }
    }
    return Promise.all(jobs);
  }

  resolve(league: LeagueId, team: string): Record<HornType, Resolved> {
    const out = {} as Record<HornType, Resolved>;
    for (const type of TYPES) {
      const mine = this.localFile(league, team, type);
      const lib = this.cloudFile(league, team, type);
      const gen = this.genericFile(league, type);
      if (usable(mine)) out[type] = { source: 'yours', uri: mine.uri };
      else if (usable(lib)) out[type] = { source: 'library', uri: lib.uri };
      else if (usable(gen)) out[type] = { source: 'generic', uri: gen.uri };
      else out[type] = { source: 'built-in', uri: null };
    }
    return out;
  }

  // Copies an MP3 picked from the phone in as this team's horn. Throws if it isn't an MP3.
  async saveYours(league: LeagueId, team: string, type: HornType, picked: File) {
    const buf = await picked.bytes();
    if (!isMp3(buf)) throw new Error('That file is not an MP3.');
    const dest = this.localFile(league, team, type);
    dest.write(buf);
  }

  removeYours(league: LeagueId, team: string, type: HornType) {
    const f = this.localFile(league, team, type);
    if (f.exists) f.delete();
  }
}
