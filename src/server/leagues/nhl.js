// NHL: api-web.nhle.com (public, no key).
const { getJSON, etDate, etHour } = require('../net');
const { findTeam } = require('../../shared/teams');

const API = 'https://api-web.nhle.com/v1';
const logoFor = abbrev => `https://assets.nhle.com/logos/nhl/svg/${abbrev}_light.svg`;

function periodLabel(n, type) {
  if (type === 'SO') return 'SO';
  if (type === 'OT' || n > 3) return n > 4 ? (n - 3) + 'OT' : 'OT';
  return ['', '1st', '2nd', '3rd'][n] || '';
}

function side(t) {
  return { abbrev: t.abbrev, name: findTeam('NHL', t.abbrev)?.name || t.name?.default || t.abbrev, logo: t.logo || logoFor(t.abbrev), score: t.score ?? 0 };
}

function normalize(g) {
  const st = g.gameState;
  const state = (st === 'LIVE' || st === 'CRIT') ? 'LIVE' : (st === 'OFF' || st === 'FINAL') ? 'FINAL' : 'FUT';
  const period = g.period || g.periodDescriptor?.number || 0;
  const ptype = g.periodDescriptor?.periodType;
  const pl = periodLabel(period, ptype);
  const inter = !!g.clock?.inIntermission;
  let status = '';
  if (state === 'LIVE') status = inter ? 'Intermission after the ' + pl : pl + ' period, ' + (g.clock?.timeRemaining || '') + ' left';
  else if (state === 'FINAL') status = 'Final' + (period > 3 ? ' (' + pl + ')' : '');
  return {
    id: g.id, league: 'NHL', state, start: g.startTimeUTC || null, venue: g.venue?.default || '',
    status, period, intermission: inter,
    periods: ['1st', '2nd', '3rd'].concat(period > 3 ? [pl] : []),
    home: side(g.homeTeam), away: side(g.awayTeam),
    scoring: (g.goals || []).map(x => ({
      team: x.teamAbbrev?.default || x.teamAbbrev, text: x.name?.default || x.firstName?.default || '',
      playerId: x.playerId || null, period: x.period || x.periodDescriptor?.number || 0,
      periodLabel: periodLabel(x.period || x.periodDescriptor?.number || 0, x.periodDescriptor?.periodType),
      time: x.timeInPeriod || '', badge: x.strength && x.strength !== 'ev' ? x.strength : null,
    })),
  };
}

const mine = (g, team) => g.homeTeam?.abbrev === team || g.awayTeam?.abbrev === team;

async function today(team) {
  const dates = [etDate()];
  // A game that runs past midnight Eastern stays on screen until 4am.
  if (etHour() < 4) dates.unshift(etDate(new Date(Date.now() - 86400000)));
  let found = [];
  for (const d of dates) {
    const json = await getJSON(`${API}/score/${d}`);
    found = found.concat((json.games || []).filter(g => mine(g, team)));
  }
  const live = found.find(g => g.gameState === 'LIVE' || g.gameState === 'CRIT');
  const g = live || found[found.length - 1];
  return g ? normalize(g) : null;
}

async function next(team) {
  const now = Date.now();
  for (const path of [`/club-schedule-season/${team}/now`, `/club-schedule/${team}/month/now`]) {
    try {
      const json = await getJSON(API + path);
      const g = (json.games || []).filter(x => new Date(x.startTimeUTC).getTime() > now)
        .sort((a, b) => new Date(a.startTimeUTC) - new Date(b.startTimeUTC))[0];
      if (g) return Object.assign(normalize(g), { state: 'FUT', status: '' });
    } catch (e) { /* try the next source */ }
  }
  return null;
}

module.exports = { today, next, normalize };
