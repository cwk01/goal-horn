// NFL: ESPN's public site API (no key; needs a browser-like user agent).
import { getJSON, etDate, etHour, daysAgo } from '../net';
import { findTeam } from '../teams';
import type { Game, LeagueAdapter, ScoringPlay, Side } from '../types';

const API = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

const score = (s: any) => (s == null ? 0 : typeof s === 'object' ? Number(s.value ?? s.displayValue) || 0 : Number(s) || 0);
const logo = (t: any) => t?.logo || t?.logos?.[0]?.href || (t?.abbreviation ? `https://a.espncdn.com/i/teamlogos/nfl/500/${t.abbreviation.toLowerCase()}.png` : '');
const qLabel = (q: number) => (q > 4 ? 'OT' : q ? 'Q' + q : '');

function side(c: any): Side {
  const abbrev = c?.team?.abbreviation;
  return { abbrev, name: findTeam('NFL', abbrev)?.name || c?.team?.displayName || abbrev, logo: logo(c?.team), score: score(c?.score), id: c?.team?.id };
}

export function normalize(ev: any): Game {
  const comp = ev.competitions?.[0] || {};
  const st = comp.status || ev.status || {};
  const type = st.type || {};
  const home = (comp.competitors || []).find((c: any) => c.homeAway === 'home');
  const away = (comp.competitors || []).find((c: any) => c.homeAway === 'away');
  const state = type.state === 'post' || type.completed ? 'FINAL' : type.state === 'in' ? 'LIVE' : 'FUT';
  const q = st.period || 0;
  const brk = type.name === 'STATUS_HALFTIME' || type.name === 'STATUS_END_PERIOD';
  let status = '';
  if (state === 'LIVE') status = type.name === 'STATUS_HALFTIME' ? 'Halftime' : brk ? type.shortDetail || 'End of ' + qLabel(q) : qLabel(q) + ', ' + (st.displayClock || '') + ' left';
  else if (state === 'FINAL') status = 'Final' + (q > 4 ? ' (OT)' : '');
  const sit = comp.situation || {};
  const h = side(home), a = side(away);
  let possession: string | null = null;
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
const scoringCache: Record<string, { at: number; final: boolean; list: ScoringPlay[] }> = {};
async function scoring(eventId: string): Promise<ScoringPlay[]> {
  const hit = scoringCache[eventId];
  if (hit && (hit.final || Date.now() - hit.at < 20000)) return hit.list;
  try {
    const json = await getJSON(`${API}/summary?event=${encodeURIComponent(eventId)}`, 15000);
    const list: ScoringPlay[] = (json.scoringPlays || []).map((p: any) => {
      const sType = p.scoringType || {}, ty = p.type || {};
      const kind = `${sType.name || ''} ${sType.displayName || ''} ${ty.text || ''}`.toLowerCase();
      let badge: string | null = String(sType.abbreviation || ty.abbreviation || '').toLowerCase() || null;
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
  } catch (e) {
    return hit ? hit.list : [];
  }
}

const mine = (ev: any, team: string) => (ev.competitions?.[0]?.competitors || []).some((c: any) => c.team?.abbreviation === team);

async function schedule(team: string): Promise<any[]> {
  const out: any[] = [];
  for (const q of ['', '?seasontype=3']) {
    try {
      const json = await getJSON(`${API}/teams/${encodeURIComponent(team.toLowerCase())}/schedule${q}`);
      out.push(...(json.events || []));
    } catch (e) { /* postseason may not exist */ }
  }
  return out.sort((a, b) => +new Date(a.date) - +new Date(b.date));
}

export const nfl: LeagueAdapter = {
  async today(team) {
    const ymd = (d: Date) => etDate(d).replace(/-/g, '');
    const now = new Date();
    const dates = etHour() < 4 ? ymd(daysAgo(1)) + '-' + ymd(now) : ymd(now);
    const json = await getJSON(`${API}/scoreboard?dates=${dates}`);
    const list = (json.events || []).filter((e: any) => mine(e, team));
    const live = list.find((e: any) => e.competitions?.[0]?.status?.type?.state === 'in');
    const todays = list.filter((e: any) => etDate(new Date(e.date)) === etDate(now));
    const ev = live || todays[todays.length - 1];
    if (!ev) return null;
    const g = normalize(ev);
    if (g.state !== 'FUT') g.scoring = await scoring(ev.id);
    return g;
  },

  async next(team) {
    const now = Date.now();
    const ev = (await schedule(team)).find(e => new Date(e.date).getTime() > now);
    return ev ? { ...normalize(ev), state: 'FUT', status: '' } : null;
  },

  async last(team) {
    const done = (await schedule(team)).filter(e => e.competitions?.[0]?.status?.type?.completed);
    const ev = done[done.length - 1];
    if (!ev) return null;
    const g = normalize(ev);
    g.state = 'FINAL';
    g.scoring = await scoring(ev.id);
    return g;
  },
};
