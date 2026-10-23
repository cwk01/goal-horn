// The Goal Horn server. Plain Node, no framework.
//
//   /            control page (scoreboard, horn button, settings)
//   /speaker     speaker page: open it on any phone, tablet, TV or PC on the same Wi-Fi
//   /events      live channel (Server-Sent Events) every open page listens on
//   /api/...     JSON API used by the pages
//
// The desktop app (main.js) and the headless runner (cli.js) both start this.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Settings } = require('./settings');
const { Library, key } = require('./library');
const { Tracker } = require('./tracker');
const { Player } = require('./player');
const { LEAGUES, teams, findTeam } = require('../shared/teams');
const pkg = require('../../package.json');

const WEB = path.join(__dirname, '..', 'web');
const SHARED = path.join(__dirname, '..', 'shared');
const ASSETS = path.join(__dirname, '..', 'assets');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  const rank = ip => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  return out.sort((a, b) => rank(a) - rank(b));
}

// The names other devices can use to reach this computer. Router-assigned IP addresses
// change; the computer's name doesn't, so pages try the name first and fall back to the IP.
// <name>.local is answered by the computer itself (Bonjour on Mac, mDNS on Windows 10+,
// Avahi on Linux). Set GOAL_HORN_NAME to use a different name, such as one your router's DNS knows.
function hostNames() {
  const custom = String(process.env.GOAL_HORN_NAME || '').trim().toLowerCase();
  if (custom) return [custom];
  const h = os.hostname().trim().toLowerCase().replace(/\.$/, '');
  // Docker gives containers a random 12-character ID as the hostname; nobody can resolve that.
  if (!h || h === 'localhost' || /^[0-9a-f]{12}$/.test(h) || !/^[a-z0-9][a-z0-9.-]*$/.test(h)) return [];
  const label = h.split('.')[0];
  const out = [label + '.local'];
  if (h.includes('.') && !h.endsWith('.local')) out.push(h);
  return out;
}

// Pages loaded from any address on the home network may call the API, so a page
// keeps working after it switches to this computer's new address.
function isPrivateHost(host) {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local') || !host.includes('.') ||
    /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host) || hostNames().includes(host);
}

function isLocal(req) {
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function createGoalHorn({ dataDir, headless = false, log = console.log }) {
  const settings = new Settings(dataDir);
  const library = new Library(dataDir);
  const tracker = new Tracker(settings, log);
  const player = headless ? new Player(log) : null;
  const customCss = path.join(dataDir, 'custom.css');
  if (!fs.existsSync(customCss)) fs.writeFileSync(customCss, '/* Your own styles. Edit from Settings > Advanced > Edit files. */\n');

  // Lets a page check it found this Goal Horn and not another one in the house.
  const idFile = path.join(dataDir, 'instance-id');
  let instanceId = '';
  try { instanceId = fs.readFileSync(idFile, 'utf8').trim(); } catch (e) {}
  if (!instanceId) { instanceId = crypto.randomUUID(); fs.writeFileSync(idFile, instanceId); }

  let horns = {};
  let hornVersion = Date.now();
  let port = null;
  let syncing = null;

  function applyHorns() {
    const s = settings.get();
    horns = library.resolve(s.league, s.team, s.teamHorns);
    hornVersion = Date.now();
    broadcast('horns', hornInfo());
  }

  function hornInfo() {
    const out = {};
    for (const t of ['goal', 'win']) out[t] = { source: horns[t]?.source, file: path.basename(horns[t]?.file || ''), src: `/audio/${t}?v=${hornVersion}` };
    return out;
  }

  function syncHorns(refresh = false) {
    const s = settings.get();
    syncing = library.sync(s.libraryUrl, s.league, s.team, refresh)
      .then(results => {
        const got = results.filter(r => r.result === 'ok').map(r => r.url);
        if (got.length) log('library: downloaded ' + got.join(', '));
      })
      .catch(e => log('library: ' + e.message))
      .finally(() => { applyHorns(); syncing = null; });
    return syncing;
  }

  // ── Live channel ────────────────────────────────────────────────────────────
  const clients = new Map();
  let nextClientId = 1;

  function broadcast(event, data, filter = () => true) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients.values()) if (filter(c)) c.res.write(msg);
  }

  function speakers() {
    return [...clients.values()].filter(c => c.role !== 'control').map(c => ({ id: c.id, name: c.name, role: c.role, since: c.since, ready: c.ready }));
  }

  const announceSpeakers = () => broadcast('speakers', speakers());

  function sound(type, origin) {
    const s = settings.get();
    const label = type === 'win' ? 'win' : LEAGUES[s.league].horn.toLowerCase();
    log(`horn: ${label} (${origin})`);
    broadcast('play', { type, src: `/audio/${type}?v=${hornVersion}`, volume: s.volume, at: Date.now(), origin });
    if (player && s.playHere) player.play(horns[type].file, s.volume);
    // A person pressing the goal horn is reacting to their TV: use it to measure the delay.
    if (type === 'goal' && origin !== 'auto' && origin !== 'test') tracker.notePress(Date.now());
  }

  function silence() {
    broadcast('stop', { at: Date.now() });
    if (player) player.stop();
  }

  tracker.on('horn', type => sound(type, 'auto'));
  tracker.on('delay', d => broadcast('delay', { ...d, delay: settings.get().delay }));

  // ── HTTP ────────────────────────────────────────────────────────────────────
  function send(res, code, body, type = 'application/json') {
    const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(data);
  }

  function sendFile(res, file, extraHeaders = {}) {
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, { error: 'Not found' });
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...extraHeaders });
      res.end(buf);
    });
  }

  function readBody(req, limit = 20 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      const chunks = []; let size = 0;
      req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('File is larger than 20 MB.')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  async function readJson(req) {
    const buf = await readBody(req, 1024 * 1024);
    return buf.length ? JSON.parse(buf.toString('utf8')) : {};
  }

  // Name first, then IP addresses.
  function home() {
    return {
      id: instanceId,
      names: hostNames().map(h => `http://${h}:${port}`),
      ips: lanAddresses().map(ip => `http://${ip}:${port}`),
    };
  }

  function speakerUrls() {
    const h = home();
    return [...h.names, ...h.ips].map(b => b + '/speaker');
  }

  function state() {
    const s = settings.get();
    const { teamHorns, ...pub } = s;
    return {
      version: pkg.version, settings: pub, league: LEAGUES[s.league], team: findTeam(s.league, s.team),
      horns: hornInfo(), speakers: speakers(), speakerUrls: speakerUrls(), home: home(), headless,
      soundCard: player ? player.available : null, error: tracker.error,
    };
  }

  async function route(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const method = req.method;

    const origin = req.headers.origin;
    if (origin) {
      let o = null; try { o = new URL(origin); } catch (e) {}
      if (o && o.protocol === 'http:' && Number(o.port || 80) === port && isPrivateHost(o.hostname)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
        res.setHeader('Vary', 'Origin');
      }
    }
    if (method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (p === '/api/ping' && method === 'GET') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return send(res, 200, { app: 'goal-horn', id: instanceId });
    }

    // Pages and static files
    if (method === 'GET' && (p === '/' || p === '/index.html')) return sendFile(res, path.join(WEB, 'index.html'));
    if (method === 'GET' && (p === '/speaker' || p === '/speaker.html')) return sendFile(res, path.join(WEB, 'speaker.html'));
    if (method === 'GET' && p === '/custom.css') return sendFile(res, customCss);
    if (method === 'GET' && p.startsWith('/shared/')) return sendFile(res, path.join(SHARED, path.basename(p)));
    if (method === 'GET' && p.startsWith('/assets/fonts/')) return sendFile(res, path.join(ASSETS, 'fonts', path.basename(p)), { 'Cache-Control': 'max-age=31536000' });
    if (method === 'GET' && p.startsWith('/assets/')) return sendFile(res, path.join(ASSETS, path.basename(p)));
    if (method === 'GET' && /^\/[\w.-]+\.(js|css|svg|png|ico)$/.test(p)) return sendFile(res, path.join(WEB, path.basename(p)));

    // Live channel
    if (method === 'GET' && p === '/events') {
      const id = nextClientId++;
      const role = ['control', 'speaker', 'local'].includes(url.searchParams.get('role')) ? url.searchParams.get('role') : 'speaker';
      const name = String(url.searchParams.get('name') || (role === 'local' ? 'This computer' : 'Speaker ' + id)).slice(0, 40);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ id, horns: hornInfo() })}\n\n`);
      clients.set(id, { id, res, role, name, since: Date.now(), ready: role !== 'speaker' });
      announceSpeakers();
      req.on('close', () => { clients.delete(id); announceSpeakers(); });
      return;
    }

    // API
    if (p === '/api/state' && method === 'GET') return send(res, 200, state());
    if (p === '/api/teams' && method === 'GET') return send(res, 200, { leagues: LEAGUES, teams });

    if (p === '/api/game' && method === 'GET') {
      return send(res, 200, { game: tracker.delayed(), next: tracker.next, error: tracker.error, delay: settings.get().delay, updated: Date.now() });
    }

    if (p === '/api/settings' && method === 'POST') {
      const body = await readJson(req);
      const { changedTeam } = settings.update(body);
      if (changedTeam) { tracker.reset(); tracker.tick().catch(() => {}); }
      if (changedTeam || body.libraryUrl !== undefined) await syncHorns(false);
      broadcast('state', state());
      return send(res, 200, state());
    }

    if (p === '/api/horn' && method === 'POST') {
      const body = await readJson(req).catch(() => ({}));
      sound(body.type === 'win' ? 'win' : 'goal', body.from || 'button');
      return send(res, 200, { ok: true });
    }

    if (p === '/api/stop' && method === 'POST') { silence(); return send(res, 200, { ok: true }); }

    if (p === '/api/ready' && method === 'POST') {
      const body = await readJson(req).catch(() => ({}));
      const c = clients.get(Number(body.id));
      if (c) { c.ready = !!body.ready; if (body.name) c.name = String(body.name).slice(0, 40); announceSpeakers(); }
      return send(res, 200, { ok: !!c });
    }

    if (p === '/api/test' && method === 'POST') {
      const body = await readJson(req).catch(() => ({}));
      const target = Number(body.id);
      broadcast('play', { type: 'goal', src: `/audio/goal?v=${hornVersion}`, volume: settings.get().volume, at: Date.now(), origin: 'test' }, c => c.id === target);
      return send(res, 200, { ok: true });
    }

    const audio = p.match(/^\/audio\/(goal|win)$/);
    if (audio && method === 'GET') return sendFile(res, horns[audio[1]].file);

    const up = p.match(/^\/api\/upload\/(goal|win)$/);
    if (up && method === 'POST') {
      try {
        const buf = await readBody(req);
        const s = settings.get();
        const file = library.saveUpload(s.league, s.team, up[1], buf);
        const k = key(s.league, s.team);
        s.teamHorns[k] = { ...(s.teamHorns[k] || {}), [up[1]]: file };
        settings.save();
        applyHorns();
        return send(res, 200, state());
      } catch (e) { return send(res, 400, { error: e.message }); }
    }

    if (p === '/api/horns/clear' && method === 'POST') {
      const type = url.searchParams.get('type') === 'win' ? 'win' : 'goal';
      const s = settings.get(); const k = key(s.league, s.team);
      if (s.teamHorns[k]) { delete s.teamHorns[k][type]; if (!Object.keys(s.teamHorns[k]).length) delete s.teamHorns[k]; settings.save(); }
      applyHorns();
      return send(res, 200, state());
    }

    if (p === '/api/horns/refresh' && method === 'POST') { await syncHorns(true); return send(res, 200, state()); }

    if (p === '/api/qr' && method === 'GET') {
      // The IP address works on every phone; the speaker page moves itself to the name if that works too.
      const ip = home().ips[0];
      const target = url.searchParams.get('url') || (ip ? ip + '/speaker' : speakerUrls()[0]) || `http://localhost:${port}/speaker`;
      const svg = await QRCode.toString(target, { type: 'svg', margin: 1, color: { dark: '#000000', light: '#ffffff' } });
      return send(res, 200, svg, 'image/svg+xml');
    }

    // Admin editor: only from the computer running Goal Horn.
    if (p === '/api/admin/file') {
      if (!isLocal(req)) return send(res, 403, { error: 'File editing only works on the computer running Goal Horn.' });
      const name = url.searchParams.get('name');
      const files = { 'settings.json': settings.file, 'custom.css': customCss };
      if (!files[name]) return send(res, 400, { error: 'Unknown file' });
      if (method === 'GET') return send(res, 200, { name, content: fs.readFileSync(files[name], 'utf8') });
      if (method === 'POST') {
        const { content } = await readJson(req);
        if (typeof content !== 'string') return send(res, 400, { error: 'No content' });
        if (name === 'settings.json') {
          try { JSON.parse(content); } catch (e) { return send(res, 400, { error: 'Not valid JSON: ' + e.message }); }
        }
        fs.writeFileSync(files[name] + '.bak', fs.readFileSync(files[name]));
        fs.writeFileSync(files[name], content);
        if (name === 'settings.json') { settings.load(); tracker.reset(); await syncHorns(false); }
        broadcast('state', state());
        return send(res, 200, { ok: true });
      }
    }

    send(res, 404, { error: 'Not found' });
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch(e => { log('error: ' + e.stack); if (!res.headersSent) send(res, 500, { error: e.message }); });
  });

  // Keeps the live channel open through proxies and sleepy Wi-Fi.
  const keepAlive = setInterval(() => { for (const c of clients.values()) c.res.write(': ping\n\n'); }, 20000);

  function listen(wanted) {
    return new Promise((resolve, reject) => {
      let tryPort = wanted;
      const attempt = () => {
        server.once('error', err => {
          if (err.code === 'EADDRINUSE' && tryPort < wanted + 10) { tryPort++; attempt(); } else reject(err);
        });
        server.listen(tryPort, '0.0.0.0', () => resolve(tryPort));
      };
      attempt();
    });
  }

  return {
    settings, tracker, library,
    async start() {
      port = await listen(settings.get().port);
      applyHorns();
      syncHorns(false);
      tracker.start();
      return { port, local: `http://localhost:${port}/`, speakerUrls: speakerUrls() };
    },
    async stop() {
      clearInterval(keepAlive);
      tracker.stop();
      for (const c of clients.values()) c.res.end();
      await new Promise(r => server.close(r));
    },
    get port() { return port; },
    sound, silence,
  };
}

module.exports = { createGoalHorn, lanAddresses, hostNames };
