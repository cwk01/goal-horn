// Small fetch helpers. Some sports APIs reject requests without a browser-like
// user agent (ESPN's CDN does), so every request sends one.
const UA = 'Mozilla/5.0 (GoalHorn; +https://goalhorn.colbykordas.com)';

async function getText(url, timeoutMs = 10000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json,*/*' }, signal: ctl.signal });
    if (!res.ok) { const e = new Error('HTTP ' + res.status + ' from ' + new URL(url).host); e.status = res.status; throw e; }
    return await res.text();
  } finally { clearTimeout(timer); }
}

async function getJSON(url, timeoutMs) {
  let raw = (await getText(url, timeoutMs)).trim();
  // HockeyTech wraps JSON in parentheses.
  if (raw.startsWith('(') && raw.endsWith(')')) raw = raw.slice(1, -1);
  return JSON.parse(raw);
}

async function getBuffer(url, timeoutMs = 20000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctl.signal });
    if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
    return Buffer.from(await res.arrayBuffer());
  } finally { clearTimeout(timer); }
}

// Date helpers in US Eastern time, which is what the leagues schedule by.
function etDate(d = new Date()) { return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); }
function etHour(d = new Date()) { return Number(d.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' })) % 24; }

module.exports = { getText, getJSON, getBuffer, etDate, etHour, UA };
