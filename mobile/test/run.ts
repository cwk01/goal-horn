/// <reference types="node" />
// Logic tests with fake games, no network and no phone needed: npm test
import assert from 'node:assert';
import { leagues } from '../src/leagues';
import { Tracker } from '../src/tracker';
import { countdown, gameDay, gameTime, shortDay } from '../src/format';
import { accentFor, paletteFor } from '../src/theme';
import { findTeam, teams } from '../src/teams';
import type { Settings } from '../src/settings';
import type { Game } from '../src/types';

let pass = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); pass++; console.log('  ok  ' + msg); };

// A settings store without AsyncStorage.
function fakeStore(over: Partial<Settings> = {}) {
  let data = { league: 'NHL', team: 'BOS', delay: 0, autoGoal: true, autoWin: true, learnDelay: true, delayMeasured: [] as number[],
    volume: 100, keepAwake: true, libraryUrl: 'http://127.0.0.1:1', setupDone: true, ...over } as Settings;
  return {
    get: () => data,
    update(p: Partial<Settings>) { data = { ...data, ...p }; return { changedTeam: false }; },
    subscribe: () => () => {},
  };
}

const nhl = (bos: number, state: Game['state'] = 'LIVE', extra: Partial<Game> = {}): Game => ({
  id: 2026020101, league: 'NHL', state, start: new Date().toISOString(), venue: 'TD Garden', status: '2nd period, 12:34 left',
  period: 2, intermission: false, periods: ['1st', '2nd', '3rd'],
  away: { abbrev: 'TOR', name: 'Toronto Maple Leafs', logo: '', score: 2 },
  home: { abbrev: 'BOS', name: 'Boston Bruins', logo: '', score: bos },
  scoring: [], ...extra,
});

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

(async () => {
  // Auto horn and win horn off the delayed view.
  {
    let game = nhl(2);
    leagues.NHL.today = async () => JSON.parse(JSON.stringify(game));
    leagues.NHL.next = async () => null;
    leagues.NHL.last = async () => null;
    const store = fakeStore();
    const t = new Tracker(store as never);
    const horns: string[] = [];
    t.on('horn', h => horns.push(h));
    await t.tick();
    ok(t.view.game?.home.score === 2, 'first poll shows the game');
    game = nhl(3);
    t.refresh(); await wait(20);
    ok(horns.join() === 'goal', 'auto horn sounds when the Bruins score');
    game = nhl(3, 'FINAL');
    t.refresh(); await wait(20);
    ok(horns.join() === 'goal,win', 'win horn sounds when the Bruins win');
  }

  // Manual horn stays quiet when auto is off, and a press teaches the TV delay.
  {
    let game = nhl(1);
    leagues.NHL.today = async () => JSON.parse(JSON.stringify(game));
    const store = fakeStore({ autoGoal: false });
    const t = new Tracker(store as never);
    const horns: string[] = [];
    const learned: number[] = [];
    t.on('horn', h => horns.push(h));
    t.on('delay', e => { if (e.applied != null) learned.push(e.applied); });
    await t.tick();
    game = nhl(2);
    t.refresh(); await wait(20);
    ok(horns.length === 0, 'no automatic horn when it is turned off');
    t.notePress(Date.now() + 34000);
    ok(learned[0] === 34 && store.get().delay === 34, 'a press 34s after the data sets the TV delay to 34s');
    ok(store.get().delayMeasured.join() === '34', 'the measured gap is kept for the average');
  }

  // A gap too far off is thrown out.
  {
    let game = nhl(1);
    leagues.NHL.today = async () => JSON.parse(JSON.stringify(game));
    const store = fakeStore({ autoGoal: false, delay: 20 });
    const t = new Tracker(store as never);
    await t.tick();
    game = nhl(2);
    t.refresh(); await wait(20);
    t.notePress(Date.now() + 150000);
    ok(store.get().delay === 20, 'a press 150s later does not change the delay');
  }

  // The scoreboard waits for the TV delay.
  {
    let game = nhl(1);
    leagues.NHL.today = async () => JSON.parse(JSON.stringify(game));
    const store = fakeStore({ delay: 30 });
    const t = new Tracker(store as never);
    const horns: string[] = [];
    t.on('horn', h => horns.push(h));
    await t.tick();
    game = nhl(2);
    t.refresh(); await wait(20);
    ok(t.view.game?.home.score === 1 && horns.length === 0, 'with a 30s delay the new goal is held back');
  }

  // Previous game is looked up when there's no game today.
  {
    leagues.NHL.today = async () => null;
    leagues.NHL.next = async () => nhl(0, 'FUT', { id: 'n1', start: new Date(Date.now() + 86400000 + 3600000).toISOString() });
    leagues.NHL.last = async () => nhl(4, 'FINAL', { scoring: [{ team: 'BOS', text: 'D. Pastrnak', period: 1, periodLabel: '1st', time: '04:12', badge: null }] });
    const t = new Tracker(fakeStore() as never);
    await t.tick();
    ok(t.view.game === null && t.view.next?.state === 'FUT', 'no game today, next game loaded');
    ok(t.view.last?.scoring.length === 1, "last game's goals loaded for the goals list");
  }

  // Formatting, in Eastern time.
  {
    const g = nhl(0, 'FUT', { start: '2026-11-08T18:00:00Z' });
    ok(gameDay(g) === 'Sun, Nov 8', 'game day reads Sun, Nov 8');
    ok(gameTime(g) === '01:00 PM ET', 'game time reads 01:00 PM ET');
    ok(shortDay(g) === 'NOV 8', 'goals header date reads NOV 8');
    const ht = { ...g, start: null, dateText: 'Sat, Nov 14 at 7:05 pm' };
    ok(gameDay(ht) === 'Sat, Nov 14' && gameTime(ht) === '7:05 PM ET', 'AHL/PWHL date text splits into day and time');
    const c = countdown(new Date(Date.now() + ((19 * 60 + 25) * 60 + 33) * 1000).toISOString())!;
    ok(c.days === 0 && c.hrs === 19 && c.min === 25 && Math.abs(c.sec - 33) <= 1, 'countdown splits into days, hours, minutes, seconds');
  }

  // Team colors stay readable on the dark screen.
  {
    ok(accentFor(findTeam('NHL', 'BOS')) === '#FCB514', 'Bruins gold is the accent');
    for (const [league, list] of Object.entries(teams)) {
      for (const tm of list) {
        const p = paletteFor(tm);
        assert.ok(/^#[0-9a-f]{6}$/i.test(p.accent), `${league} ${tm.abbrev} accent ${p.accent}`);
      }
    }
    ok(true, 'every team gets a valid accent color');
  }

  console.log(`\n${pass} passed`);
})().catch(e => { console.error(e); process.exit(1); });
