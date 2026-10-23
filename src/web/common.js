// Shared by the control page and the speaker page.

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
    const res = await fetch(src);
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
  let es = null, id = null;
  const open = () => {
    const q = new URLSearchParams({ role, name: name || '' });
    es = new EventSource('/events?' + q);
    for (const [ev, fn] of Object.entries(handlers)) {
      es.addEventListener(ev, e => { const d = JSON.parse(e.data); if (ev === 'hello') id = d.id; fn(d); });
    }
    es.onerror = () => handlers.offline && handlers.offline();
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
  const res = await fetch(path, init);
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
