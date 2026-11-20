// MLB: statsapi.mlb.com (public, no key).
import { getJSON, etDate, etHour, daysAgo } from '../net';
import { teams, findTeam } from '../teams';
import type { Game, LeagueAdapter, ScoringPlay, Side } from '../types';

const API = 'https://statsapi.mlb.com/api/v1';
const logo = (id: number) => `https://www.mlbstatic.com/team-logos/${id}.svg`;

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function side(t: any): Side {
  const abbrev = t?.team?.abbreviation;
  return { abbrev, name: findTeam('MLB', abbrev)?.name || t?.team?.name || abbrev, logo: logo(t?.team?.id), score: t?.score ?? 0 };
}

export function normalize(g: any): Game {
  const ls = g.linescore || {};
  const abs = g.status?.abstractGameState;
  const detailed = String(g.status?.detailedState || '');
  const state = abs === 'Final' ? 'FINAL' : abs === 'Live' ? 'LIVE' : 'FUT';
  const inning = ls.currentInning || 0;
  const outs = ls.outs ?? ls.offense?.outs ?? 0;
  const between = /middle|end of/i.test(ls.inningState || '') || /delay/i.test(detailed);
  let status = '';
  if (state === 'LIVE') status = between ? (ls.inningState || 'Between innings') + ' ' + inning
    : `${ls.isTopInning ? 'Top' : 'Bottom'} of the ${ordinal(inning)}, ${outs} out${outs === 1 ? '' : 's'}`;
  else if (state === 'FINAL') status = 'Final' + (inning > 9 ? ' (' + inning + ' innings)' : '');
  return {
    id: g.gamePk, league: 'MLB', state, start: g.gameDate || null, venue: g.venue?.name || '',
    status, period: inning, intermission: false, periods: [],
    home: side(g.teams?.home), away: side(g.teams?.away), scoring: [],
  };
}

// Scoring plays come from the play-by-play feed. Re-read at most every 20s while live.
const scoringCache: Record<string, { at: number; final: boolean; list: ScoringPlay[] }> = {};
async function scoring(g: any): Promise<ScoringPlay[]> {
  const hit = scoringCache[g.gamePk];
  if (hit && (hit.final || Date.now() - hit.at < 20000)) return hit.list;
  try {
    const json = await getJSON(`${API}/game/${g.gamePk}/playByPlay`, 15000);
    const away = g.teams?.away?.team?.abbreviation, home = g.teams?.home?.team?.abbreviation;
    const list: ScoringPlay[] = (json.allPlays || []).filter((p: any) => p.about?.isScoringPlay).map((p: any) => {
      const top = p.about?.isTopInning ?? p.about?.halfInning === 'top';
      const inning = p.about?.inning || 0;
      return {
        team: top ? away : home,
        text: String(p.result?.description || '').split('. ')[0].replace(/\.$/, ''),
        period: inning, periodLabel: (top ? 'Top ' : 'Bot ') + ordinal(inning), time: '',
        badge: p.result?.eventType === 'home_run' || p.result?.event === 'Home Run' ? 'hr' : null,
      };
    });
    scoringCache[g.gamePk] = { at: Date.now(), final: g.status?.abstractGameState === 'Final', list };
    return list;
  } catch (e) {
    return hit ? hit.list : [];
  }
}

const mine = (g: any, team: string) => g.teams?.home?.team?.abbreviation === team || g.teams?.away?.team?.abbreviation === team;
const idOf = (team: string) => teams.MLB.find(t => t.abbrev === team)?.id;

export const mlb: LeagueAdapter = {
  async today(team) {
    const end = etDate();
    const start = etHour() < 4 ? etDate(daysAgo(1)) : end;
    const json = await getJSON(`${API}/schedule?sportId=1&startDate=${start}&endDate=${end}&hydrate=team,linescore`);
    const games = (json.dates || []).flatMap((d: any) => d.games || []).filter((g: any) => mine(g, team));
    const live = games.find((g: any) => g.status?.abstractGameState === 'Live');
    const todays = games.filter((g: any) => etDate(new Date(g.gameDate)) === end);
    const g = live || todays[todays.length - 1];
    if (!g) return null;
    const out = normalize(g);
    if (out.state !== 'FUT') out.scoring = await scoring(g);
    return out;
  },

  async next(team) {
    const id = idOf(team);
    if (!id) return null;
    const start = etDate(), end = etDate(new Date(Date.now() + 200 * 86400000));
    const json = await getJSON(`${API}/schedule?sportId=1&teamId=${id}&startDate=${start}&endDate=${end}&hydrate=team`);
    const now = Date.now();
    const g = (json.dates || []).flatMap((d: any) => d.games || []).find((x: any) => new Date(x.gameDate).getTime() > now);
    return g ? { ...normalize(g), state: 'FUT', status: '' } : null;
  },

  async last(team) {
    const id = idOf(team);
    if (!id) return null;
    // Look back far enough to reach last season's final game in the offseason.
    const start = etDate(daysAgo(200)), end = etDate();
    const json = await getJSON(`${API}/schedule?sportId=1&teamId=${id}&startDate=${start}&endDate=${end}&hydrate=team,linescore`);
    const done = (json.dates || []).flatMap((d: any) => d.games || []).filter((g: any) => g.status?.abstractGameState === 'Final');
    const g = done[done.length - 1];
    if (!g) return null;
    const out = normalize(g);
    out.scoring = await scoring(g);
    return out;
  },
};
