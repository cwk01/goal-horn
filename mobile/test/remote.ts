/// <reference types="node" />
// Joins the real desktop server (../src/server) with fake games, from the phone's own
// join code: npm run test:remote. React Native's XMLHttpRequest is stood in for by a
// small shim over Node's http, which hands over the response text as it arrives the same way.
import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { tryAddress } from '../src/discover';
import { leagues as phoneLeagues } from '../src/leagues';
import { Remote } from '../src/remote';

class NodeXHR {
  readyState = 0; status = 0; responseText = '';
  onreadystatechange: (() => void) | null = null;
  onprogress: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private url = ''; private headers: Record<string, string> = {}; private req: http.ClientRequest | null = null;
  open(_m: string, url: string) { this.url = url; this.readyState = 1; }
  setRequestHeader(k: string, v: string) { this.headers[k] = v; }
  send() {
    this.req = http.get(this.url, { headers: this.headers }, res => {
      this.status = res.statusCode || 0; this.readyState = 2; this.onreadystatechange?.();
      res.setEncoding('utf8');
      res.on('data', (c: string) => { this.responseText += c; this.readyState = 3; this.onprogress?.(); this.onreadystatechange?.(); });
      res.on('end', () => { this.readyState = 4; this.onreadystatechange?.(); });
    });
    this.req.on('error', () => this.onerror?.());
  }
  abort() { this.req?.destroy(); }
}
(globalThis as any).XMLHttpRequest = NodeXHR;

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const until = async (fn: () => boolean, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await wait(50); } return false; };
let pass = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); pass++; console.log('  ok  ' + msg); };

(async () => {
  // Desktop server with a fake live Bruins game, as in the desktop app's own test.
  const desk = require('../../src/server/leagues');
  const fx = require('../../test/fixtures');
  desk.NHL.today = async () => fx.nhlLive();
  desk.NHL.next = async () => fx.next('NHL', 'BOS', 'MTL');
  phoneLeagues.NHL.last = async () => null;
  const { createGoalHorn } = require('../../src/server');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goalhorn-phone-'));
  fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ delay: 0, libraryUrl: 'http://127.0.0.1:1', port: 18797, setupDone: true }));
  const app = createGoalHorn({ dataDir, log: () => {} });
  const { port } = await app.start();

  const f = await tryAddress(`127.0.0.1:${port}`);
  ok(f && f.id.length > 10, 'phone finds the computer by typed address');
  ok(await tryAddress('127.0.0.1:1') === null, 'a wrong address finds nothing');

  const remote = new Remote(f!, () => ({ name: 'Colby phone', playHere: true }));
  const plays: string[] = [];
  let stops = 0;
  const delays: number[] = [];
  remote.on('play', (type, uri) => plays.push(type + ' ' + uri));
  remote.on('stop', () => stops++);
  remote.on('delay', e => { if (e.applied != null) delays.push(e.applied); });
  remote.start();

  ok(await until(() => remote.status === 'connected'), 'phone connects to the live channel');
  ok(remote.settings?.team === 'BOS', "phone reads the computer's team");
  ok(await until(() => remote.view.game?.home.abbrev === 'BOS'), "phone shows the computer's scoreboard");
  ok(remote.view.next?.away.abbrev === 'BOS' || remote.view.next?.home.abbrev === 'BOS', 'phone shows the next game');

  const st = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
  ok(await until(() => st.speakers.some((s: any) => s.name === 'Colby phone') || false, 500) ||
    (await (await fetch(`http://127.0.0.1:${port}/api/state`)).json()).speakers.some((s: any) => s.name === 'Colby phone' && s.ready),
    "the computer lists the phone as a ready speaker named 'Colby phone'");

  await remote.press('goal');
  ok(await until(() => plays.length === 1), 'pressing the horn on the phone makes the computer sound it');
  ok(/^goal http:\/\/127\.0\.0\.1:\d+\/audio\/goal\?v=\d+$/.test(plays[0]), 'the phone gets the horn file address to play');
  ok(remote.playing === 'goal', 'phone shows the horn playing');

  await remote.silence();
  ok(await until(() => stops === 1), 'stop on the phone stops it everywhere');

  await remote.update({ delay: 12, autoGoal: true });
  ok(remote.settings?.delay === 12 && remote.settings.autoGoal, "changing settings on the phone changes them on the computer");
  ok(app.settings.get().delay === 12, 'the computer saved the new delay');

  await remote.test();
  ok(await until(() => plays.length === 2), 'Test this phone plays on the phone');

  await remote.update({ league: 'NFL', team: 'NE' });
  ok(remote.settings?.team === 'NE' && app.settings.get().team === 'NE', 'changing the team on the phone changes it on the computer');

  // The computer restarts (or drops off Wi-Fi and comes back).
  await app.stop();
  ok(await until(() => remote.status === 'lost', 8000), 'phone notices the computer went away');
  const again = createGoalHorn({ dataDir, log: () => {} });
  await again.start();
  ok(await until(() => remote.status === 'connected', 25000), 'phone reconnects on its own when the computer is back');
  await remote.press('goal');
  ok(await until(() => plays.length === 3), 'the horn works again after reconnecting');

  remote.stop();
  await again.stop();
  console.log(`\n${pass} passed`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
