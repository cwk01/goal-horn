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

// Gives up after `ms` even if the request itself doesn't stop. Android doesn't always
// cancel a request to an address with nothing at it right away.
async function getJSON(url: string, ms: number, init?: RequestInit): Promise<any> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { ctl.abort(); reject(new Error('timed out')); }, ms);
  });
  const work = (async () => {
    const res = await fetch(url, { ...init, signal: ctl.signal, headers: { Accept: 'application/json', ...(init?.headers || {}) } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  })();
  work.catch(() => {}); // a late failure after the timeout is not an error
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function ping(base: string, ms = 1500): Promise<string | null> {
  return (await probe(base, ms)).id;
}

// Same as fetch-based getJSON, over plain XMLHttpRequest. Used as a second try so a
// failure in one networking path on the phone doesn't hide the computer.
function xhrJSON(url: string, ms: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    const timer = setTimeout(() => { try { x.abort(); } catch (e) { /* done */ } reject(new Error('timed out')); }, ms);
    x.onreadystatechange = () => {
      if (x.readyState !== 4) return;
      clearTimeout(timer);
      if (!x.status) return reject(new Error('no response'));
      if (x.status < 200 || x.status >= 300) return reject(new Error('HTTP ' + x.status));
      try { resolve(JSON.parse(x.responseText)); } catch (e) { reject(new Error('not Goal Horn (bad reply)')); }
    };
    x.onerror = () => { clearTimeout(timer); reject(new Error('network error')); };
    x.open('GET', url);
    x.setRequestHeader('Accept', 'application/json');
    x.send();
  });
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Asks one address whether it's Goal Horn, over fetch and plain XHR at the same time,
// so a problem in one networking path on the phone doesn't hide the computer.
// Returns its id, or why not.
export async function probe(base: string, ms = 1500): Promise<{ id: string | null; error: string }> {
  const url = base.replace(/\/+$/, '') + '/api/ping';
  const check = (j: any) => {
    if (j && j.app === 'goal-horn') return String(j.id || '');
    throw new Error('answered, but not as Goal Horn');
  };
  const tries = [getJSON(url, ms).then(check)];
  if (typeof XMLHttpRequest !== 'undefined') tries.push(xhrJSON(url, ms).then(check));
  // First success wins; otherwise report each path's error.
  const r = await new Promise<{ id: string | null; error: string }>(resolve => {
    let left = tries.length;
    const errors: string[] = [];
    tries.forEach((t, i) => t.then(
      id => resolve({ id, error: '' }),
      e => { errors[i] = msg(e); if (--left === 0) resolve({ id: null, error: [...new Set(errors)].join('; other try: ') }); },
    ));
  });
  if (r.id || !/HTTP 404/.test(r.error)) return r;
  // Goal Horn 1.0.1 and earlier have no /api/ping. Recognize them by /api/state and
  // use the address as the id (they have no id of their own).
  try {
    const st = await getJSON(base.replace(/\/+$/, '') + '/api/state', ms + 1000);
    if (st && typeof st.version === 'string' && st.settings && st.horns) return { id: LEGACY + base.replace(/\/+$/, ''), error: '' };
  } catch (e) { /* not Goal Horn */ }
  return r;
}

// Prefix on ids made up for older desktop versions that don't report their own.
export const LEGACY = 'address:';

// Reads the computer's details once it has answered a ping.
export async function describe(base: string, id: string): Promise<Found> {
  base = base.replace(/\/+$/, '');
  try {
    const s = await getJSON(base + '/api/state', 4000);
    // 1.0.1 and earlier list only speaker page addresses.
    const old = (s.speakerUrls || []).map((u: string) => String(u).replace(/\/speaker$/, ''));
    const names: string[] = s.home?.names || [];
    const ips: string[] = s.home?.ips || (s.home ? [] : old);
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

export interface TryResult { found: Found | null; tried: { url: string; error: string }[] }

export async function tryAddress(typed: string): Promise<TryResult> {
  const tried: { url: string; error: string }[] = [];
  const list = candidates(typed);
  if (!list.length) return { found: null, tried: [{ url: typed, error: "that isn't an address" }] };
  for (const base of list) {
    const r = await probe(base, 3000);
    if (r.id) return { found: await describe(base, r.id), tried };
    tried.push({ url: base, error: r.error });
  }
  return { found: null, tried };
}

// What the phone thinks its network is, for error messages.
export async function phoneInfo(): Promise<string> {
  try {
    const Network = require('expo-network') as typeof import('expo-network');
    const [st, ip] = await Promise.all([Network.getNetworkStateAsync().catch(() => null), Network.getIpAddressAsync().catch(() => '')]);
    const type = st?.type ? String(st.type).toLowerCase() : 'unknown';
    return `This phone: ${ip || 'no address'} on ${type}${st?.type === Network.NetworkStateType.VPN ? ' (a VPN can send the app around your Wi-Fi)' : ''}.`;
  } catch (e) {
    return '';
  }
}

export function sameSubnet(ip: string): string | null {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip || '');
  if (!m || ip === '0.0.0.0' || ip.startsWith('127.')) return null;
  return `${m[1]}.${m[2]}.${m[3]}.`;
}

export interface ScanProgress { network: string; checked: number; total: number }

export interface ScanOptions {
  want?: string;                          // stop as soon as this computer id answers
  onFound?: (f: Found) => void;
  onProgress?: (p: ScanProgress) => void;
  signal?: { cancelled: boolean };
  prefix?: string;                        // tests only: scan this network instead of the phone's
  ports?: number[];
}

// The phone's Wi-Fi network as "192.168.4.", or an error that says why there isn't one.
async function phoneNetwork(): Promise<string> {
  // Loaded here so the rest of this file also runs in Node tests.
  const Network = require('expo-network') as typeof import('expo-network');
  const state = await Network.getNetworkStateAsync().catch(() => null);
  if (state && state.type === Network.NetworkStateType.VPN) {
    throw new Error("This phone is on a VPN, so it can't scan your Wi-Fi. Turn the VPN off, or type the computer's address below.");
  }
  if (state && state.type !== Network.NetworkStateType.WIFI && state.type !== Network.NetworkStateType.ETHERNET) {
    throw new Error("This phone isn't on Wi-Fi. Connect it to the same Wi-Fi as the computer.");
  }
  const ip = await Network.getIpAddressAsync().catch(() => '');
  const prefix = sameSubnet(ip);
  if (!prefix) throw new Error(`Couldn't read this phone's Wi-Fi address${ip ? ` (got ${ip})` : ''}. Type the computer's address instead.`);
  return prefix;
}

// Pings every address on the phone's network: port 8787 first, the other ports only if
// nothing answered there. 64 at a time, each given 1.2 seconds, so a pass takes about 5 seconds.
export async function scan(opts: ScanOptions = {}): Promise<Found[]> {
  const prefix = opts.prefix ?? (await phoneNetwork());
  const ports = opts.ports ?? PORTS;
  const found: Found[] = [];
  const seen = new Set<string>();
  const network = prefix + 'x';
  const total = 254 * ports.length;
  let checked = 0;
  for (const port of ports) {
    const targets: string[] = [];
    for (let i = 1; i < 255; i++) targets.push(`http://${prefix}${i}:${port}`);
    let next = 0;
    let stop = false;
    const worker = async () => {
      while (!stop && !opts.signal?.cancelled && next < targets.length) {
        const base = targets[next++];
        const id = await ping(base, 1200);
        checked++;
        opts.onProgress?.({ network, checked, total });
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const f = await describe(base, id);
        found.push(f);
        opts.onFound?.(f);
        if (opts.want && id === opts.want) stop = true;
      }
    };
    await Promise.all(Array.from({ length: 64 }, worker));
    if (found.length || opts.signal?.cancelled) break;
    checked = 254 * (ports.indexOf(port) + 1);
  }
  return found;
}
