// Shared by the control page and the speaker page.

// ── Finding Goal Horn ─────────────────────────────────────────────────────────
// The router can give the computer running Goal Horn a new IP address at any time,
// so pages reach it by the computer's name when that works and fall back to its IP
// addresses. A page opened at an IP address moves to the name before sound is turned
// on, so bookmarks keep working. If the connection drops later, the page tries every
// address it knows and carries on at whichever answers, without reloading, so a
// speaker keeps its sound on.
// Settings saved on this device (speaker name, volume) belong to the address the page
// was opened at, so they ride along in the URL when the page moves to the name.
function carryOut() {
  const keep = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('gh.') && k !== 'gh.home') keep[k] = localStorage.getItem(k); } } catch (e) {}
  return 'gh-carry=' + encodeURIComponent(JSON.stringify(keep));
}
if (location.hash.startsWith('#gh-carry=')) {
  try {
    const keep = JSON.parse(decodeURIComponent(location.hash.slice(10)));
    for (const [k, v] of Object.entries(keep)) if (k.startsWith('gh.') && localStorage.getItem(k) === null) localStorage.setItem(k, String(v));
  } catch (e) {}
  history.replaceState(null, '', location.pathname + location.search);
}

const Home = {
  base: '',          // '' means the address this page was opened from
  id: null,
  names: [], ips: [],

  at(p) { return this.base + p; },
  here() { return this.base || location.origin; },
  onComputer() { return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname); },
  onIp() { return /^\d+\.\d+\.\d+\.\d+$/.test(location.hostname); },

  learn(h) {
    if (!h) return;
    this.id = h.id || this.id;
    this.names = h.names || [];
    this.ips = h.ips || [];
    try { localStorage.setItem('gh.home', JSON.stringify({ id: this.id, names: this.names, ips: this.ips })); } catch (e) {}
  },

  remembered() {
    try { const h = JSON.parse(localStorage.getItem('gh.home') || 'null'); if (h && !this.id) this.learn(h); } catch (e) {}
  },

  async ping(base, ms = 3000) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(base + '/api/ping', { cache: 'no-store', signal: ctl.signal });
      const d = await r.json();
      return d.app === 'goal-horn' && (!this.id || d.id === this.id);
    } catch (e) { return false; } finally { clearTimeout(timer); }
  },

  use(base) { this.base = base === location.origin ? '' : base; },

  // Opened at an IP address and the name answers: reload at the name if nothing would be
  // lost (sound not turned on yet), otherwise just send requests to the name from now on.
  async preferName(canReload) {
    if (this.onComputer() || !this.onIp()) return;
    for (const b of this.names) {
      if (!(await this.ping(b))) continue;
      if (canReload()) location.replace(b + location.pathname + location.search + '#' + carryOut());
      else this.use(b);
      return;
    }
  },

  // The connection dropped: find Goal Horn again, name first.
  async find() {
    this.remembered();
    const tried = new Set();
    for (const b of [...this.names, location.origin, ...this.ips]) {
      if (tried.has(b)) continue; tried.add(b);
      if (await this.ping(b)) { this.use(b); return true; }
    }
    return false;
  },
};

// ── Audio ─────────────────────────────────────────────────────────────────────
// Web Audio instead of <audio>: once the context is unlocked by a tap, phones and
// TVs will play every later horn without asking again.
const Horn = {
  ctx: null, buffers: {}, srcs: {}, node: null, onplay: null, onend: null,

  unlocked() { return !!this.ctx && this.ctx.state === 'running'; },

  async unlock() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state !== 'running') await this.ctx.resume();
    // A silent blip finishes the unlock on older iOS.
    const b = this.ctx.createBuffer(1, 1, 22050); const s = this.ctx.createBufferSource();
    s.buffer = b; s.connect(this.ctx.destination); s.start(0);
    return this.unlocked();
  },

  async load(type, src) {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.srcs[type] === src && this.buffers[type]) return;
    const res = await fetch(Home.at(src));
    if (!res.ok) throw new Error('Could not load the ' + type + ' horn');
    const data = await res.arrayBuffer();
    this.buffers[type] = await new Promise((ok, bad) => this.ctx.decodeAudioData(data, ok, bad));
    this.srcs[type] = src;
  },

  async play(type, src, volume = 1) {
    await this.load(type, src);
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
    this.stop();
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));
    source.buffer = this.buffers[type];
    source.connect(gain).connect(this.ctx.destination);
    source.onended = () => { if (this.node === source) { this.node = null; this.onend && this.onend(type); } };
    source.start(0);
    this.node = source;
    this.onplay && this.onplay(type, this.buffers[type].duration);
  },

  stop() {
    if (this.node) { try { this.node.stop(); } catch (e) {} this.node = null; this.onend && this.onend(); }
  },
};

// ── Live channel ──────────────────────────────────────────────────────────────
function connectLive(role, name, handlers) {
  let es = null, id = null, searching = null;
  const open = () => {
    const q = new URLSearchParams({ role, name: name || '' });
    es = new EventSource(Home.at('/events?' + q));
    for (const [ev, fn] of Object.entries(handlers)) {
      es.addEventListener(ev, e => { const d = JSON.parse(e.data); if (ev === 'hello') id = d.id; fn(d); });
    }
    es.onopen = () => { clearInterval(searching); searching = null; };
    es.onerror = () => {
      handlers.offline && handlers.offline();
      // The browser keeps retrying the same address. If that hasn't worked in 10 seconds,
      // look for Goal Horn at its other addresses.
      if (!searching) searching = setInterval(async () => {
        if (es.readyState === EventSource.OPEN) return;
        const was = Home.here();
        if (await Home.find() && Home.here() !== was) { es.close(); open(); }
      }, 10000);
    };
  };
  open();
  return {
    get id() { return id; },
    close() { es && es.close(); },
    reopen(newRole, newName) { role = newRole; name = newName; es && es.close(); open(); },
  };
}

async function api(path, opts = {}) {
  const init = { method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'), headers: {} };
  if (opts.body instanceof Blob || opts.body instanceof ArrayBuffer) init.body = opts.body;
  else if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(Home.at(path), init);
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data && data.error) || 'Request failed (' + res.status + ')');
  return data;
}

// ── Team color ────────────────────────────────────────────────────────────────
function applyTeamColor(team) {
  const root = document.documentElement.style;
  const hex = (team && team.primary) || '#FCB514';
  root.setProperty('--team', hex);
  root.setProperty('--team-2', (team && team.secondary) || '#FFFFFF');
  // Pick black or white text for the team color by luminance.
  const n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  root.setProperty('--on-team', lum > 0.55 ? '#10151B' : '#FFFFFF');
}

// Keeps a phone or tablet screen awake so it stays connected.
async function keepAwake() {
  try { if ('wakeLock' in navigator) { const l = await navigator.wakeLock.request('screen'); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); }, { once: true }); return l; } } catch (e) {}
  return null;
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
