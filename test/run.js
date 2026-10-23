// End-to-end test without network: fake league data, a real server, real HTTP and
// a real live channel. Run with: npm test
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const leagues = require('../src/server/leagues');
const fx = require('./fixtures');

let game = fx.nhlLive();
leagues.NHL.today = async () => JSON.parse(JSON.stringify(game));
leagues.NHL.next = async () => fx.next('NHL', 'BOS', 'MTL');
leagues.NFL.today = async () => fx.nflLive();
leagues.NFL.next = async () => null;

const { createGoalHorn } = require('../src/server');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goalhorn-test-'));
fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ delay: 0, autoGoal: true, libraryUrl: 'http://127.0.0.1:1', port: 18787, setupDone: true }));

function listen(base, role, name) {
  const events = [];
  const ctl = new AbortController();
  const ready = fetch(`${base}events?role=${role}&name=${encodeURIComponent(name)}`, { signal: ctl.signal }).then(async res => {
    const reader = res.body.getReader(); let buf = '';
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          buf += Buffer.from(value).toString();
          let i; while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
            const ev = /event: (\w+)/.exec(chunk), data = /data: (.*)/.exec(chunk);
            if (ev && data) events.push({ event: ev[1], data: JSON.parse(data[1]) });
          }
        }
      } catch (e) { /* aborted */ }
    })();
  });
  return { events, ready, close: () => ctl.abort() };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await wait(50); } return false; };

(async () => {
  const app = createGoalHorn({ dataDir, log: () => {} });
  const { local } = await app.start();
  const j = async (p, body) => (await fetch(local + p.slice(1), body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  let pass = 0; const ok = (cond, msg) => { assert.ok(cond, msg); pass++; console.log('  ok  ' + msg); };

  const fresh = new (require('../src/server/settings').Settings)(fs.mkdtempSync(path.join(os.tmpdir(), 'goalhorn-defaults-')));
  ok(fresh.get().autoGoal === false && fresh.get().learnDelay === true, 'new installs start with the manual horn and delay learning on');
  const st = await j('/api/state');
  ok(st.settings.team === 'BOS' && st.team.name === 'Boston Bruins', 'state reports the Bruins');
  ok(st.horns.goal.source === 'built-in', 'built-in horn used when the library is unreachable');

  const speaker = listen(local, 'speaker', 'Kitchen TV');
  await speaker.ready;
  await until(() => speaker.events.some(e => e.event === 'hello'));
  const hello = speaker.events.find(e => e.event === 'hello');
  await j('/api/ready', { id: hello.data.id, ready: true });
  const st2 = await j('/api/state');
  ok(st2.speakers.some(s => s.name === 'Kitchen TV' && s.ready), 'speaker shows up as ready');

  await until(() => app.tracker.current);
  const g = await j('/api/game');
  ok(g.game && g.game.home.abbrev === 'BOS' && g.game.scoring.length === 5, 'game endpoint returns the live game');

  await j('/api/horn', { type: 'goal' });
  ok(await until(() => speaker.events.some(e => e.event === 'play' && e.data.origin === 'button')), 'button press reaches the speaker');

  const audio = await fetch(local + 'audio/goal');
  ok(audio.status === 200 && audio.headers.get('content-type') === 'audio/mpeg', 'horn audio is served');

  // Auto horn: the Bruins score.
  game.home.score = 4; app.tracker.lastPoll = 0;
  ok(await until(() => speaker.events.some(e => e.event === 'play' && e.data.origin === 'auto')), 'auto horn fires when the score goes up');

  // Opponent scores: no horn.
  const before = speaker.events.filter(e => e.event === 'play').length;
  game.away.score = 3; app.tracker.lastPoll = 0;
  await wait(2500);
  ok(speaker.events.filter(e => e.event === 'play').length === before, 'no horn when the other team scores');

  // Win at the final horn.
  game.state = 'FINAL'; game.status = 'Final'; app.tracker.lastPoll = 0;
  ok(await until(() => speaker.events.some(e => e.event === 'play' && e.data.type === 'win')), 'win horn fires at the final');

  // Broadcast delay: a new score is held back.
  app.settings.update({ delay: 3 });
  game = fx.nhlLive(); game.id = 99; app.tracker.reset(); await app.tracker.tick();
  game.home.score = 5; app.tracker.lastPoll = 0; await app.tracker.tick();
  const shownNow = (await j('/api/game')).game.home.score;
  ok(shownNow === 3, 'scoreboard is held back by the TV delay');
  await wait(3200);
  ok((await j('/api/game')).game.home.score === 5, 'delayed score appears after the delay');
  app.settings.update({ delay: 0 });

  // Delay learning: the data shows a goal, and the person presses the horn 37s later.
  app.settings.update({ delay: 0, learnDelay: true, delayMeasured: [], autoGoal: false });
  game = fx.nhlLive(); game.id = 100; app.tracker.reset(); await app.tracker.tick();
  game.home.score = 4; app.tracker.lastPoll = 0; await app.tracker.tick();
  const change = app.tracker.changes[0];
  ok(change && change.score === 4, 'score change in the live data is recorded');
  app.tracker.notePress(change.at + 37000);
  ok(app.settings.get().delay === 37 && app.settings.get().delayMeasured[0] === 37, 'pressing the horn 37s after the data sets the delay to 37s');
  game.home.score = 5; app.tracker.lastPoll = 0; await app.tracker.tick();
  app.tracker.notePress(app.tracker.changes[1].at + 41000);
  ok(app.settings.get().delay === 39, 'second goal averages the delay (37 and 41 make 39)');
  app.tracker.notePress(Date.now() - 400000);
  ok(app.settings.get().delay === 39, 'a press with no matching goal changes nothing');
  app.settings.update({ learnDelay: false, delayMeasured: [] });
  game.home.score = 6; app.tracker.lastPoll = 0; await app.tracker.tick();
  app.tracker.notePress(app.tracker.changes[2].at + 10000);
  ok(app.settings.get().delay === 39, 'with learning off the delay stays where it was');
  app.settings.update({ delay: 0 });

  // Upload a team horn, then remove it.
  const mp3 = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'default-win.mp3'));
  const up = await (await fetch(local + 'api/upload/goal', { method: 'POST', body: mp3 })).json();
  ok(up.horns.goal.source === 'upload', 'upload becomes the team horn');
  const bad = await fetch(local + 'api/upload/goal', { method: 'POST', body: Buffer.from('not audio'.repeat(200)) });
  ok(bad.status === 400, 'non-MP3 upload is refused');
  const cleared = await (await fetch(local + 'api/horns/clear?type=goal', { method: 'POST' })).json();
  ok(cleared.horns.goal.source === 'built-in', 'removing the upload falls back');

  // Switch to football.
  const nfl = await j('/api/settings', { league: 'NFL', team: 'NE' });
  ok(nfl.league.button === 'TD' && nfl.team.name === 'New England Patriots', 'switching to the Patriots relabels the horn');
  await app.tracker.tick();
  const ng = await j('/api/game');
  ok(ng.game.league === 'NFL' && ng.game.situation.possession === 'NE', 'football game shows down and distance');

  // QR and pages.
  ok((await (await fetch(local + 'api/qr')).text()).startsWith('<svg'), 'QR code renders');
  for (const p of ['', 'speaker', 'app.js', 'speaker.js', 'common.js', 'style.css', 'shared/teams.js', 'custom.css', 'assets/icon.svg']) {
    const r = await fetch(local + p); assert.strictEqual(r.status, 200, '/' + p);
  }
  ok(true, 'all pages and scripts are served');

  // Admin editor works from this machine and validates JSON.
  const badJson = await fetch(local + 'api/admin/file?name=settings.json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '{ nope' }) });
  ok(badJson.status === 400, 'editor refuses broken settings.json');

  speaker.close();
  await app.stop();
  console.log(`\n${pass} checks passed.`);
  process.exit(0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
