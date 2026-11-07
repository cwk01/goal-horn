// Finds Goal Horn computers on the same Wi-Fi. The desktop and Docker versions answer
// GET /api/ping with { app: 'goal-horn', id } on port 8787 (or the next free port).

export const PORTS = [8787, 8788, 8789];

export interface Found {
  id: string;          // the computer's instance id, stable across IP changes
  base: string;        // address that answered, e.g. http://192.168.4.20:8787
  label: string;       // the computer's name if it has one, else its IP
  team: string;        // e.g. "Boston Bruins"
  urls: string[];      // every address the computer says it can be reached at
}

async function getJSON(url: string, ms: number, init?: RequestInit): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal, headers: { Accept: 'application/json', ...(init?.headers || {}) } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function ping(base: string, ms = 1500): Promise<string | null> {
  try {
    const j = await getJSON(base.replace(/\/+$/, '') + '/api/ping', ms);
    return j && j.app === 'goal-horn' ? String(j.id || '') : null;
  } catch (e) {
    return null;
  }
}

// Reads the computer's details once it has answered a ping.
export async function describe(base: string, id: string): Promise<Found> {
  base = base.replace(/\/+$/, '');
  try {
    const s = await getJSON(base + '/api/state', 4000);
    const names: string[] = s.home?.names || [];
    const ips: string[] = s.home?.ips || [];
    const host = (u: string) => u.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
    return { id, base, label: names[0] ? host(names[0]).replace(/\.local$/, '') : host(base), team: s.team?.name || '', urls: [...names, ...ips] };
  } catch (e) {
    return { id, base, label: base.replace(/^https?:\/\//, ''), team: '', urls: [base] };
  }
}

// Turns what someone typed ("192.168.4.20", "colbys-pc.local:8787",
// "http://192.168.4.20:8787/speaker") into base addresses to try.
export function candidates(typed: string): string[] {
  let t = typed.trim();
  if (!t) return [];
  if (!/^https?:\/\//i.test(t)) t = 'http://' + t;
  let u: URL;
  try { u = new URL(t); } catch (e) { return []; }
  const host = u.hostname;
  if (u.port) return [`${u.protocol}//${host}:${u.port}`];
  return PORTS.map(p => `http://${host}:${p}`);
}

export async function tryAddress(typed: string): Promise<Found | null> {
  for (const base of candidates(typed)) {
    const id = await ping(base, 2500);
    if (id) return describe(base, id);
  }
  return null;
}

export function sameSubnet(ip: string): string | null {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip || '');
  if (!m || ip === '0.0.0.0' || ip.startsWith('127.')) return null;
  return `${m[1]}.${m[2]}.${m[3]}.`;
}

// Pings every address on this phone's /24 network. Stops early if `want` (an
// instance id) is found. About 254 x 3 quick requests, 48 at a time.
export async function scan(opts: { want?: string; onFound?: (f: Found) => void; signal?: { cancelled: boolean } } = {}): Promise<Found[]> {
  // Loaded here so the rest of this file also runs in Node tests.
  const { getIpAddressAsync } = require('expo-network') as typeof import('expo-network');
  const ip = await getIpAddressAsync().catch(() => '');
  const prefix = sameSubnet(ip);
  if (!prefix) throw new Error("This phone isn't on Wi-Fi.");
  const targets: string[] = [];
  for (const port of PORTS) for (let i = 1; i < 255; i++) targets.push(`http://${prefix}${i}:${port}`);
  const found: Found[] = [];
  const seen = new Set<string>();
  let next = 0;
  let stop = false;
  const worker = async () => {
    while (!stop && !opts.signal?.cancelled && next < targets.length) {
      const base = targets[next++];
      const id = await ping(base, 900);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const f = await describe(base, id);
      found.push(f);
      opts.onFound?.(f);
      if (opts.want && id === opts.want) stop = true;
    }
  };
  await Promise.all(Array.from({ length: 48 }, worker));
  return found;
}
