// AHL and PWHL: HockeyTech schedule feed (public keys used by the leagues' own sites).
// The feed returns the league's current season when no season_id is given.
const { getJSON } = require('../net');
const { teams } = require('../../shared/teams');

const CONF = {
  AHL:  { client: 'ahl',  key: 'ccb91f29d6744675' },
  PWHL: { client: 'pwhl', key: '694cfeed58c932ee' },
};

// AHL logos: the NHL CDN has SVGs for some clubs; the rest come from LeagueStat.
const AHL_SLUGS = { PRO: 'PRO', HER: 'HER', ROC: 'ROC', SYR: 'SYR', MIL: 'MIL', BAK: 'BAK', COL: 'COL', SD: 'SDG', SJ: 'SJB',
  CHI: 'CHI', CLE: 'CLM', TEX: 'TXS', MAN: 'MAN', HEN: 'HEN', WBS: 'WBS', CLT: 'CHA', CV: 'CVF', SPR: 'SPR' };

function logo(league, abbrev, id) {
  if (league === 'AHL' && AHL_SLUGS[abbrev]) return `https://assets.nhle.com/logos/ahl/svg/${AHL_SLUGS[abbrev]}_light.svg`;
  return `https://assets.leaguestat.com/${league.toLowerCase()}/logos/${id}.png`;
}

const cache = {};
async function schedule(league) {
  const c = cache[league];
  if (c && Date.now() - c.at < 60000) return c.rows;
  const { client, key } = CONF[league];
  const url = `https://lscluster.hockeytech.com/feed/index.php?feed=statviewfeed&view=schedule&client_code=${client}&site_id=1&league_id=1&lang=en&fmt=json&key=${key}`;
  const data = await getJSON(url, 15000);
  const rows = data?.[0]?.sections?.[0]?.data || [];
  cache[league] = { at: Date.now(), rows };
  return rows;
}

const todayText = () => new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
const isTimeOfDay = s => /^\s*\d{1,2}:\d{2}\s*(am|pm)/i.test(s);

function normalize(league, g) {
  const row = g.row || {}, prop = g.prop || {};
  const homeId = parseInt(prop.home_team_city?.teamLink), awayId = parseInt(prop.visiting_team_city?.teamLink);
  const byId = id => teams[league].find(t => t.id === id) || { abbrev: String(id), name: String(id) };
  const h = byId(homeId), a = byId(awayId);
  const status = String(row.game_status || '');
  const low = status.toLowerCase();
  const state = low.includes('final') ? 'FINAL' : (!status || low === 'tbd' || isTimeOfDay(status)) ? 'FUT' : 'LIVE';
  return {
    id: row.game_id, league, state, start: null, dateText: (row.date_with_day || '') + (state === 'FUT' && status ? ' at ' + status : ''),
    venue: row.venue_name || '', status: state === 'FUT' ? '' : status, period: 0, intermission: /intermission/i.test(status),
    periods: [],
    home: { abbrev: h.abbrev, name: h.name, logo: logo(league, h.abbrev, homeId), score: parseInt(row.home_goal_count) || 0 },
    away: { abbrev: a.abbrev, name: a.name, logo: logo(league, a.abbrev, awayId), score: parseInt(row.visiting_goal_count) || 0 },
    scoring: [],
  };
}

function make(league) {
  const idOf = team => teams[league].find(t => t.abbrev === team)?.id;
  const mine = (g, id) => parseInt(g.prop?.home_team_city?.teamLink) === id || parseInt(g.prop?.visiting_team_city?.teamLink) === id;
  return {
    async today(team) {
      const id = idOf(team); if (!id) return null;
      const t = todayText();
      const g = (await schedule(league)).find(x => mine(x, id) && x.row?.date_with_day === t);
      return g ? normalize(league, g) : null;
    },
    async next(team) {
      const id = idOf(team); if (!id) return null;
      const t = todayText();
      const rows = (await schedule(league)).filter(x => mine(x, id));
      // Rows are in date order. Skip finished games and anything live today.
      const g = rows.find(x => !String(x.row?.game_status || '').toLowerCase().includes('final')
        && (x.row?.date_with_day !== t || isTimeOfDay(String(x.row?.game_status || ''))));
      return g ? Object.assign(normalize(league, g), { state: 'FUT', status: '' }) : null;
    },
  };
}

module.exports = { AHL: make('AHL'), PWHL: make('PWHL') };
