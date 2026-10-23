// NFL: ESPN's public site API (no key; needs a browser-like user agent).
const { getJSON, etDate, etHour } = require('../net');
const { findTeam } = require('../../shared/teams');

const API = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

const score = s => (s == null ? 0 : typeof s === 'object' ? Number(s.value ?? s.displayValue) || 0 : Number(s) || 0);
const logo = t => t?.logo || t?.logos?.[0]?.href || (t?.abbreviation ? `https://a.espncdn.com/i/teamlogos/nfl/500/${t.abbreviation.toLowerCase()}.png` : '');
const qLabel = q => (q > 4 ? 'OT' : q ? 'Q' + q : '');

function side(c) {
  const abbrev = c?.team?.abbreviation;
  return { abbrev, name: findTeam('NFL', abbrev)?.name || c?.team?.displayName || abbrev, logo: logo(c?.team), score: score(c?.score), id: c?.team?.id };
}

function normalize(ev) {
  const comp = ev.competitions?.[0] || {};
  const st = comp.status || ev.status || {};
  const type = st.type || {};
  const home = (comp.competitors || []).find(c => c.homeAway === 'home');
  const away = (comp.competitors || []).find(c => c.homeAway === 'away');
  const state = (type.state === 'post' || type.completed) ? 'FINAL' : type.state === 'in' ? 'LIVE' : 'FUT';
  const q = st.period || 0;
  const brk = type.name === 'STATUS_HALFTIME' || type.name === 'STATUS_END_PERIOD';
  let status = '';
  if (state === 'LIVE') status = type.name === 'STATUS_HALFTIME' ? 'Halftime' : brk ? (type.shortDetail || 'End of ' + qLabel(q)) : qLabel(q) + ', ' + (st.displayClock || '') + ' left';
  else if (state === 'FINAL') status = 'Final' + (q > 4 ? ' (OT)' : '');
  const sit = comp.situation || {};
  const h = side(home), a = side(away);
  let possession = null;
  if (sit.possession) possession = String(sit.possession) === String(h.id) ? h.abbrev : String(sit.possession) === String(a.id) ? a.abbrev : null;
  return {
    id: ev.id, league: 'NFL', state, start: ev.date || null, venue: comp.venue?.fullName || '',
    status, period: q, intermission: brk, periods: ['Q1', 'Q2', 'Q3', 'Q4'].concat(q > 4 ? ['OT'] : []),
    home: h, away: a, scoring: [],
    situation: state === 'LIVE' && !brk && sit.downDistanceText
      ? { text: sit.downDistanceText, possession, redZone: !!sit.isRedZone, lastPlay: sit.lastPlay?.text || '' } : null,
  };
}

// The summary feed is large: re-read at most every 20s while live, keep finished games.
const scoringCache = {};
async function scoring(eventId) {
  const hit = scoringCache[eventId];
  if (hit && (hit.final || Date.now() - hit.at < 20000)) return hit.list;
  try {
    const json = await getJSON(`${API}/summary?event=${encodeURIComponent(eventId)}`, 15000);
    const list = (json.scoringPlays || []).map(p => {
      const sType = p.scoringType || {}, ty = p.type || {};
      const kind = `${sType.name || ''} ${sType.displayName || ''} ${ty.text || ''}`.toLowerCase();
      let badge = String(sType.abbreviation || ty.abbreviation || '').toLowerCase() || null;
      if (/two.?point|2pt/.test(kind)) badge = '2pt';
      else if (kind.includes('touchdown')) badge = 'td';
      else if (kind.includes('field goal') || kind.includes('field-goal')) badge = 'fg';
      else if (kind.includes('safety')) badge = 'saf';
      return {
        team: p.team?.abbreviation, text: String(p.text || ty.text || '').replace(/\s*\([^)]*\)\s*$/, ''),
        period: p.period?.number || 0, periodLabel: qLabel(p.period?.number || 0), time: p.clock?.displayValue || '', badge,
      };
    });
    scoringCache[eventId] = { at: Date.now(), final: !!json.header?.competitions?.[0]?.status?.type?.completed, list };
    return list;
  } catch (e) { return hit ? hit.list : []; }
}

const mine = (ev, team) => (ev.competitions?.[0]?.competitors || []).some(c => c.team?.abbreviation === team);

async function today(team) {
  const ymd = d => etDate(d).replace(/-/g, '');
  const now = new Date();
  const dates = etHour() < 4 ? ymd(new Date(now - 86400000)) + '-' + ymd(now) : ymd(now);
  const json = await getJSON(`${API}/scoreboard?dates=${dates}`);
  const list = (json.events || []).filter(e => mine(e, team));
  const live = list.find(e => e.competitions?.[0]?.status?.type?.state === 'in');
  const todays = list.filter(e => etDate(new Date(e.date)) === etDate(now));
  const ev = live || todays[todays.length - 1];
  if (!ev) return null;
  const g = normalize(ev);
  if (g.state !== 'FUT') g.scoring = await scoring(ev.id);
  return g;
}

async function next(team) {
  const now = Date.now();
  for (const q of ['', '?seasontype=3']) {
    try {
      const json = await getJSON(`${API}/teams/${encodeURIComponent(team.toLowerCase())}/schedule${q}`);
      const ev = (json.events || []).filter(e => new Date(e.date).getTime() > now).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
      if (ev) return Object.assign(normalize(ev), { state: 'FUT', status: '' });
    } catch (e) { /* try postseason */ }
  }
  return null;
}

module.exports = { today, next, normalize };
