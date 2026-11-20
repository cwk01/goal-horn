// NHL: api-web.nhle.com (public, no key).
import { getJSON, etDate, etHour, daysAgo } from '../net';
import { findTeam } from '../teams';
import type { Game, LeagueAdapter, Side } from '../types';

const API = 'https://api-web.nhle.com/v1';
const logoFor = (abbrev: string) => `https://assets.nhle.com/logos/nhl/svg/${abbrev}_light.svg`;

function periodLabel(n: number, type?: string): string {
  if (type === 'SO') return 'SO';
  if (type === 'OT' || n > 3) return n > 4 ? n - 3 + 'OT' : 'OT';
  return ['', '1st', '2nd', '3rd'][n] || '';
}

function side(t: any): Side {
  return { abbrev: t.abbrev, name: findTeam('NHL', t.abbrev)?.name || t.name?.default || t.abbrev, logo: t.logo || logoFor(t.abbrev), score: t.score ?? 0 };
}

export function normalize(g: any): Game {
  const st = g.gameState;
  const state = st === 'LIVE' || st === 'CRIT' ? 'LIVE' : st === 'OFF' || st === 'FINAL' ? 'FINAL' : 'FUT';
  const period = g.period || g.periodDescriptor?.number || 0;
  const pl = periodLabel(period, g.periodDescriptor?.periodType);
  const inter = !!g.clock?.inIntermission;
  let status = '';
  if (state === 'LIVE') status = inter ? 'Intermission after the ' + pl : pl + ' period, ' + (g.clock?.timeRemaining || '') + ' left';
  else if (state === 'FINAL') status = 'Final' + (period > 3 ? ' (' + pl + ')' : '');
  return {
    id: g.id, league: 'NHL', state, start: g.startTimeUTC || null, venue: g.venue?.default || '',
    status, period, intermission: inter,
    periods: ['1st', '2nd', '3rd'].concat(period > 3 ? [pl] : []),
    home: side(g.homeTeam), away: side(g.awayTeam),
    scoring: (g.goals || []).map((x: any) => {
      const n = x.period || x.periodDescriptor?.number || 0;
      return {
        team: x.teamAbbrev?.default || x.teamAbbrev, text: x.name?.default || x.firstName?.default || '',
        playerId: x.playerId || null, period: n, periodLabel: periodLabel(n, x.periodDescriptor?.periodType),
        time: x.timeInPeriod || '', badge: x.strength && x.strength !== 'ev' ? x.strength : null,
      };
    }),
  };
}

const mine = (g: any, team: string) => g.homeTeam?.abbrev === team || g.awayTeam?.abbrev === team;

async function gamesOn(date: string, team: string): Promise<any[]> {
  const json = await getJSON(`${API}/score/${date}`);
  return (json.games || []).filter((g: any) => mine(g, team));
}

export const nhl: LeagueAdapter = {
  async today(team) {
    const dates = [etDate()];
    // A game that runs past midnight Eastern stays on screen until 4am.
    if (etHour() < 4) dates.unshift(etDate(daysAgo(1)));
    let found: any[] = [];
    for (const d of dates) found = found.concat(await gamesOn(d, team));
    const live = found.find(g => g.gameState === 'LIVE' || g.gameState === 'CRIT');
    const g = live || found[found.length - 1];
    return g ? normalize(g) : null;
  },

  async next(team) {
    const now = Date.now();
    for (const path of [`/club-schedule-season/${team}/now`, `/club-schedule/${team}/month/now`]) {
      try {
        const json = await getJSON(API + path);
        const g = (json.games || []).filter((x: any) => new Date(x.startTimeUTC).getTime() > now)
          .sort((a: any, b: any) => +new Date(a.startTimeUTC) - +new Date(b.startTimeUTC))[0];
        if (g) return { ...normalize(g), state: 'FUT', status: '' };
      } catch (e) { /* try the next source */ }
    }
    return null;
  },

  async last(team) {
    const json = await getJSON(`${API}/club-schedule-season/${team}/now`);
    const done = (json.games || []).filter((x: any) => x.gameState === 'OFF' || x.gameState === 'FINAL')
      .sort((a: any, b: any) => +new Date(a.startTimeUTC) - +new Date(b.startTimeUTC));
    const g = done[done.length - 1];
    if (!g) return null;
    // The schedule has no goals; the score feed for that date does.
    const day = g.gameDate || etDate(new Date(g.startTimeUTC));
    const full = (await gamesOn(day, team)).find(x => x.id === g.id);
    return normalize(full || g);
  },
};
