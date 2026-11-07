// Fake games for UI work without a live game: set EXPO_PUBLIC_DEMO=next or =live
// before `npx expo start`. Never active in a normal build.
import { leagues } from './leagues';
import type { Game } from './types';

const logo = (a: string) => `https://assets.nhle.com/logos/nhl/svg/${a}_light.svg`;

function game(over: Partial<Game>): Game {
  return {
    id: 2026020199, league: 'NHL', state: 'FUT', start: null, venue: 'TD Garden', status: '', period: 0, intermission: false,
    periods: ['1st', '2nd', '3rd'],
    home: { abbrev: 'BOS', name: 'Boston Bruins', logo: logo('BOS'), score: 0 },
    away: { abbrev: 'FLA', name: 'Florida Panthers', logo: logo('FLA'), score: 0 },
    scoring: [], ...over,
  };
}

const lastGame = () => game({
  id: 2026020180, state: 'FINAL', status: 'Final', start: new Date(Date.now() - 3 * 86400000).toISOString(),
  away: { abbrev: 'NJD', name: 'New Jersey Devils', logo: logo('NJD'), score: 2 },
  home: { abbrev: 'BOS', name: 'Boston Bruins', logo: logo('BOS'), score: 4 },
  scoring: [
    { team: 'BOS', text: 'P. Zacha', playerId: 1, period: 1, periodLabel: '1st', time: '06:02', badge: null },
    { team: 'NJD', text: 'J. Hughes', playerId: 9, period: 1, periodLabel: '1st', time: '11:40', badge: 'pp' },
    { team: 'BOS', text: 'P. Zacha', playerId: 1, period: 2, periodLabel: '2nd', time: '14:24', badge: 'pp' },
    { team: 'BOS', text: 'M. Geekie', playerId: 2, period: 2, periodLabel: '2nd', time: '16:57', badge: null },
    { team: 'BOS', text: 'F. Minten', playerId: 3, period: 3, periodLabel: '3rd', time: '08:39', badge: 'en' },
  ],
});

export function install(mode: string) {
  const next = game({ start: new Date(Date.now() + (19 * 3600 + 25 * 60 + 33) * 1000).toISOString() });
  const live = game({
    state: 'LIVE', status: '2nd period, 12:34 left', period: 2, start: new Date(Date.now() - 50 * 60000).toISOString(),
    home: { abbrev: 'BOS', name: 'Boston Bruins', logo: logo('BOS'), score: 3 },
    away: { abbrev: 'FLA', name: 'Florida Panthers', logo: logo('FLA'), score: 1 },
    scoring: [
      { team: 'BOS', text: 'D. Pastrnak', playerId: 4, period: 1, periodLabel: '1st', time: '04:12', badge: null },
      { team: 'FLA', text: 'S. Reinhart', playerId: 8, period: 1, periodLabel: '1st', time: '09:40', badge: 'pp' },
      { team: 'BOS', text: 'D. Pastrnak', playerId: 4, period: 2, periodLabel: '2nd', time: '02:10', badge: null },
      { team: 'BOS', text: 'C. McAvoy', playerId: 5, period: 2, periodLabel: '2nd', time: '06:55', badge: 'pp' },
    ],
  });
  leagues.NHL.today = async () => (mode === 'live' ? live : null);
  leagues.NHL.next = async () => next;
  leagues.NHL.last = async () => lastGame();
}
