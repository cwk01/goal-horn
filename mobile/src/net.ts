// Fetch helpers. ESPN's CDN rejects requests without a browser-like user agent,
// so every request sends one.
export const UA = 'Mozilla/5.0 (GoalHorn Android; +https://goalhorn.colbykordas.com)';

export class HttpError extends Error {
  constructor(public status: number, host: string) {
    super(`HTTP ${status} from ${host}`);
  }
}

async function request(url: string, timeoutMs: number, accept: string): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: ctl.signal });
    if (!res.ok) throw new HttpError(res.status, url.split('/')[2] || url);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function getJSON(url: string, timeoutMs = 10000): Promise<any> {
  const res = await request(url, timeoutMs, 'application/json,*/*');
  let raw = (await res.text()).trim();
  // HockeyTech wraps JSON in parentheses.
  if (raw.startsWith('(') && raw.endsWith(')')) raw = raw.slice(1, -1);
  return JSON.parse(raw);
}

export async function getBytes(url: string, timeoutMs = 20000): Promise<Uint8Array> {
  const res = await request(url, timeoutMs, '*/*');
  return new Uint8Array(await res.arrayBuffer());
}

// The leagues schedule by US Eastern time.
export function etDate(d = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export function etHour(d = new Date()): number {
  return Number(d.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' })) % 24;
}

export const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
