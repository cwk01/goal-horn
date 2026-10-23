// Fake games for tests and screenshots, in the normalized shape the adapters return.
const nhlLive = () => ({
  id: 2026020101, league: 'NHL', state: 'LIVE', start: new Date(Date.now() - 50 * 60000).toISOString(), venue: 'TD Garden',
  status: '2nd period, 12:34 left', period: 2, intermission: false, periods: ['1st', '2nd', '3rd'],
  away: { abbrev: 'TOR', name: 'Toronto Maple Leafs', logo: '/assets/icon.svg', score: 2 },
  home: { abbrev: 'BOS', name: 'Boston Bruins', logo: '/assets/icon.svg', score: 3 },
  scoring: [
    { team: 'BOS', text: 'D. Pastrnak', playerId: 8477956, period: 1, periodLabel: '1st', time: '04:12', badge: null },
    { team: 'TOR', text: 'A. Matthews', playerId: 8479318, period: 1, periodLabel: '1st', time: '09:40', badge: 'pp' },
    { team: 'BOS', text: 'D. Pastrnak', playerId: 8477956, period: 1, periodLabel: '1st', time: '15:02', badge: null },
    { team: 'TOR', text: 'W. Nylander', playerId: 8477939, period: 2, periodLabel: '2nd', time: '02:10', badge: null },
    { team: 'BOS', text: 'D. Pastrnak', playerId: 8477956, period: 2, periodLabel: '2nd', time: '06:55', badge: 'pp' },
  ],
});

const nflLive = () => ({
  id: '401873010', league: 'NFL', state: 'LIVE', start: new Date().toISOString(), venue: 'Soldier Field',
  status: 'Q4, 5:27 left', period: 4, intermission: false, periods: ['Q1', 'Q2', 'Q3', 'Q4'],
  away: { abbrev: 'NE', name: 'New England Patriots', logo: '/assets/icon.svg', score: 21, id: '17' },
  home: { abbrev: 'CHI', name: 'Chicago Bears', logo: '/assets/icon.svg', score: 27, id: '3' },
  situation: { text: '3rd & 9 at CHI 10', possession: 'NE', redZone: true, lastPlay: 'D.Maye pass short right to K.Boutte for 8 yards' },
  scoring: [
    { team: 'NE', text: 'Drake Maye 12 Yd pass to Kayshon Boutte', period: 1, periodLabel: 'Q1', time: '9:13', badge: 'td' },
    { team: 'CHI', text: 'Cairo Santos 44 Yd Field Goal', period: 2, periodLabel: 'Q2', time: '0:04', badge: 'fg' },
  ],
});

const next = (league, home, away) => ({
  id: 'n1', league, state: 'FUT', start: new Date(Date.now() + (2 * 86400 + 5 * 3600) * 1000).toISOString(), venue: 'TD Garden',
  status: '', period: 0, intermission: false, periods: [],
  home: { abbrev: home, name: home, logo: '/assets/icon.svg', score: 0 }, away: { abbrev: away, name: away, logo: '/assets/icon.svg', score: 0 }, scoring: [],
});

module.exports = { nhlLive, nflLive, next };
