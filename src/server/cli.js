#!/usr/bin/env node
// Headless runner for a Raspberry Pi or home server: no window, horn plays
// through this machine's sound card (needs mpg123, ffplay or paplay on Linux,
// afplay on macOS). Open the printed address from any browser to control it.
//
//   node src/server/cli.js [--data <folder>] [--port <n>]
const path = require('path');
const os = require('os');
const { createGoalHorn } = require('./index');

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const dataDir = opt('--data') || process.env.GOALHORN_DATA || path.join(os.homedir(), '.goal-horn');

const app = createGoalHorn({ dataDir, headless: true, log: m => console.log(new Date().toISOString(), m) });
if (opt('--port')) app.settings.update({ port: Number(opt('--port')) });

app.start().then(({ local, speakerUrls }) => {
  console.log('Goal Horn is running.');
  const urls = speakerUrls.length ? speakerUrls : [local + 'speaker'];
  console.log('  Control page:  ' + urls.map(u => u.replace(/\/speaker$/, '/')).join('  or  '));
  console.log('  Speaker page:  ' + urls.join('  or  '));
  console.log('  Settings in:   ' + dataDir);
}).catch(e => { console.error(e.message); process.exit(1); });

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => app.stop().then(() => process.exit(0)));
