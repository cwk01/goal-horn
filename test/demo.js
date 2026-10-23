// Runs the app with fake games for screenshots or a quick look:
//   node test/demo.js [nhl|nfl|next|welcome] [port]
const fs = require('fs');
const os = require('os');
const path = require('path');
const leagues = require('../src/server/leagues');
const fx = require('./fixtures');

const mode = process.argv[2] || 'nhl';
const port = Number(process.argv[3] || 8790);
leagues.NHL.today = async () => (mode === 'next' ? null : fx.nhlLive());
leagues.NHL.next = async () => fx.next('NHL', 'BOS', 'MTL');
leagues.NFL.today = async () => fx.nflLive();
leagues.NFL.next = async () => null;

const { createGoalHorn } = require('../src/server');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goalhorn-demo-'));
const league = mode === 'nfl' ? 'NFL' : 'NHL', team = mode === 'nfl' ? 'NE' : 'BOS';
fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ league, team, delay: 0, port, setupDone: mode !== 'welcome', libraryUrl: 'http://127.0.0.1:1' }));
createGoalHorn({ dataDir, log: () => {} }).start().then(r => console.log('demo on', r.local));
