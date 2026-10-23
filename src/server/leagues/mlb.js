// MLB: statsapi.mlb.com (public, no key).
const { getJSON, etDate, etHour } = require('../net');
const { teams, findTeam } = require('../../shared/teams');

const API = 'https://statsapi.mlb.com/api/v1';
const logo = id => `https://www.mlbstatic.com/team-logos/${id}.svg`;

function side(t, score) {
  const abbrev = t?.team?.abbreviation;
  return { abbrev, name: findTeam('MLB', abbrev)?.name || t?.team?.name || abbrev, logo: logo(t?.team?.id), score: score ?? t?.score ?? 0 };
}

function normalize(g) {
  const ls = g.linescore || {};
  const abs = g.status?.abstractGameState;
  const detailed = String(g.status?.detailedState || '');
  const state = abs === 'Final' ? 'FINAL' : abs === 'Live' ? 'LIVE' : 'FUT';
  const inning = ls.currentInning || 0;
  const half = ls.isTopInning ? 'Top' : 'Bottom';
  const outs = ls.outs ?? ls.offense?.outs ?? 0;
  const between = /middle|end of/i.test(ls.inningState || '') || /delay/i.test(detailed);
  let status = '';
  if (state === 'LIVE') status = between ? (ls.inningState || 'Between innings') + ' ' + inning : `${half} of the ${inning}${['th','st','nd','rd'][(inning % 100 - 20) % 10] || ['th','st','nd','rd'][inning % 100] || 'th'}, ${outs} out${outs === 1 ? '' : 's'}`;
  else if (state === 'FINAL') status = 'Final' + (inning > 9 ? ' (' + inning + ' innings)' : '');
  const awayAbbrev = g.teams?.away?.team?.abbreviation, homeAbbrev = g.teams?.home?.team?.abbreviation;
  return {
    id: g.gamePk, league: 'MLB', state, start: g.gameDate || null, venue: g.venue?.name || '',
    status, period: inning, intermission: false, periods: [],
    home: side(g.teams?.home), away: side(g.teams?.away),
    scoring: [],
  };
}

// Scoring plays come from the play-by-play feed, which has the full text.
// Re-read at most every 20s while live; finished games are kept.
const scoringCache = {};
async function scoring(g) {
  const hit = scoringCache[g.gamePk];
  if (hit && (hit.final || Date.now() - hit.at < 20000)) return hit.list;
  try {
    const json = await getJSON(`${API}/game/${g.gamePk}/playByPlay`, 15000);
    const away = g.teams?.away?.team?.abbreviation, home = g.teams?.home?.team?.abbreviation;
    const list = (json.allPlays || []).filter(p => p.about?.isScoringPlay).map(p => {
      const top = p.about?.isTopInning ?? p.about?.halfInning === 'top';
      return {
        team: top ? away : home,
        text: String(p.result?.description || '').split('. ')[0].replace(/\.$/, ''),
        period: p.about?.inning || 0, periodLabel: (top ? 'Top ' : 'Bottom ') + (p.about?.inning || ''),
        time: '', badge: (p.result?.eventType === 'home_run' || p.result?.event === 'Home Run') ? 'hr' : null,
      };
    });
    scoringCache[g.gamePk] = { at: Date.now(), final: g.status?.abstractGameState === 'Final', list };
    return list;
  } catch (e) { return hit ? hit.list : []; }
}

const mine = (g, team) => g.teams?.home?.team?.abbreviation === team || g.teams?.away?.team?.abbreviation === team;

async function today(team) {
  const end = etDate();
  const start = etHour() < 4 ? etDate(new Date(Date.now() - 86400000)) : end;
  const json = await getJSON(`${API}/schedule?sportId=1&startDate=${start}&endDate=${end}&hydrate=team,linescore`);
  const games = (json.dates || []).flatMap(d => d.games || []).filter(g => mine(g, team));
  const live = games.find(g => g.status?.abstractGameState === 'Live');
  const todays = games.filter(g => etDate(new Date(g.gameDate)) === end);
  const g = live || todays[todays.length - 1];
  if (!g) return null;
  const out = normalize(g);
  if (out.state !== 'FUT') out.scoring = await scoring(g);
  return out;
}

async function next(team) {
  const id = teams.MLB.find(t => t.abbrev === team)?.id;
  if (!id) return null;
  const start = etDate(), end = etDate(new Date(Date.now() + 200 * 86400000));
  const json = await getJSON(`${API}/schedule?sportId=1&teamId=${id}&startDate=${start}&endDate=${end}&hydrate=team`);
  const now = Date.now();
  const g = (json.dates || []).flatMap(d => d.games || []).find(x => new Date(x.gameDate).getTime() > now);
  return g ? Object.assign(normalize(g), { state: 'FUT', status: '' }) : null;
}

module.exports = { today, next, normalize };
