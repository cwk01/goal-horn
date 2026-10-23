// Team lists, colors and API ids for every supported league.
// Loaded by the server (require) and by the pages (<script src="/shared/teams.js">).
(function (root) {
  // [abbrev, name, primary, secondary, apiId?]
  const T = {
    NHL: [
      ['ANA', 'Anaheim Ducks', '#F47A38', '#B9975B'], ['BOS', 'Boston Bruins', '#FCB514', '#111111'],
      ['BUF', 'Buffalo Sabres', '#00338D', '#FCB514'], ['CGY', 'Calgary Flames', '#C8102E', '#F1BE48'],
      ['CAR', 'Carolina Hurricanes', '#CC0000', '#000000'], ['CHI', 'Chicago Blackhawks', '#CF0A2C', '#FF671B'],
      ['COL', 'Colorado Avalanche', '#6F263D', '#236192'], ['CBJ', 'Columbus Blue Jackets', '#CE1126', '#002654'],
      ['DAL', 'Dallas Stars', '#00A86B', '#8F8F8C'], ['DET', 'Detroit Red Wings', '#CE1126', '#FFFFFF'],
      ['EDM', 'Edmonton Oilers', '#FF4C00', '#041E42'], ['FLA', 'Florida Panthers', '#C8102E', '#041E42'],
      ['LAK', 'Los Angeles Kings', '#A2AAAD', '#111111'], ['MIN', 'Minnesota Wild', '#2E8B57', '#A6192E'],
      ['MTL', 'Montreal Canadiens', '#AF1E2D', '#192168'], ['NSH', 'Nashville Predators', '#FFB81C', '#041E42'],
      ['NJD', 'New Jersey Devils', '#CE1126', '#000000'], ['NYI', 'New York Islanders', '#F47D30', '#00539B'],
      ['NYR', 'New York Rangers', '#3A7BD5', '#CE1126'], ['OTT', 'Ottawa Senators', '#C8102E', '#C69214'],
      ['PHI', 'Philadelphia Flyers', '#F74902', '#000000'], ['PIT', 'Pittsburgh Penguins', '#FCB514', '#000000'],
      ['SJS', 'San Jose Sharks', '#00A3AD', '#EA7200'], ['SEA', 'Seattle Kraken', '#99D9D9', '#001628'],
      ['STL', 'St. Louis Blues', '#3A6FD8', '#FCB514'], ['TBL', 'Tampa Bay Lightning', '#3A6FD8', '#FFFFFF'],
      ['TOR', 'Toronto Maple Leafs', '#3A6FD8', '#FFFFFF'], ['UTA', 'Utah Mammoth', '#6CAEDF', '#000000'],
      ['VAN', 'Vancouver Canucks', '#00843D', '#00205B'], ['VGK', 'Vegas Golden Knights', '#B4975A', '#333F42'],
      ['WSH', 'Washington Capitals', '#C8102E', '#041E42'], ['WPG', 'Winnipeg Jets', '#4A90D9', '#041E42'],
    ],
    AHL: [
      ['PRO', 'Providence Bruins', '#FCB514', '#000000', 309], ['HER', 'Hershey Bears', '#C8102E', '#041E42', 319],
      ['SPR', 'Springfield Thunderbirds', '#3A6FD8', '#C8102E', 411], ['HFD', 'Hartford Wolf Pack', '#3A7BD5', '#C8102E', 307],
      ['LV', 'Lehigh Valley Phantoms', '#F74902', '#002A5C', 313], ['BRI', 'Bridgeport Islanders', '#F47D30', '#00539B', 317],
      ['CLT', 'Charlotte Checkers', '#C8102E', '#000000', 384], ['ROC', 'Rochester Americans', '#FCB514', '#002D62', 323],
      ['SYR', 'Syracuse Crunch', '#F47920', '#00529B', 324], ['WBS', 'Wilkes-Barre/Scranton Penguins', '#FCB514', '#000000', 316],
      ['TOR', 'Toronto Marlies', '#3A6FD8', '#FFFFFF', 335], ['LAV', 'Laval Rocket', '#AF1E2D', '#003DA5', 415],
      ['BEL', 'Belleville Senators', '#C52032', '#B5985A', 413], ['UTI', 'Utica Comets', '#3A7BD5', '#FFFFFF', 390],
      ['MIL', 'Milwaukee Admirals', '#FCB514', '#041E42', 327], ['CHI', 'Chicago Wolves', '#C8102E', '#041E42', 330],
      ['CLE', 'Cleveland Monsters', '#C8102E', '#041E42', 373], ['MAN', 'Manitoba Moose', '#4A90D9', '#041E42', 321],
      ['GR', 'Grand Rapids Griffins', '#BA0C2F', '#FFFFFF', 328], ['RFD', 'Rockford IceHogs', '#CC0000', '#000000', 372],
      ['IA', 'Iowa Wild', '#2E8B57', '#DDCBA4', 389], ['TEX', 'Texas Stars', '#2E8B57', '#C0111F', 380],
      ['BAK', 'Bakersfield Condors', '#FF4C00', '#041E42', 402], ['SD', 'San Diego Gulls', '#00A3AD', '#EA7200', 404],
      ['SJ', 'San Jose Barracuda', '#00A3AD', '#EA7200', 405], ['COL', 'Colorado Eagles', '#6F263D', '#236192', 419],
      ['HEN', 'Henderson Silver Knights', '#B4975A', '#333F42', 437], ['CV', 'Coachella Valley Firebirds', '#99D9D9', '#001628', 445],
      ['ONT', 'Ontario Reign', '#A2AAAD', '#000000', 403], ['ABB', 'Abbotsford Canucks', '#00A651', '#001F5B', 398],
      ['TUC', 'Tucson Roadrunners', '#A88B5E', '#1C1C1C', 412],
    ],
    PWHL: [
      ['BOS', 'Boston Fleet', '#3A6FD8', '#C8102E', 1], ['MIN', 'Minnesota Frost', '#8C6BC8', '#FFFFFF', 2],
      ['MTL', 'Montreal Victoire', '#B03A4B', '#00294E', 3], ['NYC', 'New York Sirens', '#2EB5C9', '#00205B', 4],
      ['OTT', 'Ottawa Charge', '#C8102E', '#000000', 5], ['TOR', 'Toronto Sceptres', '#3A6FD8', '#FFFFFF', 6],
      ['SEA', 'Seattle Torrent', '#2E8BD8', '#00B388', 8], ['VAN', 'Vancouver Goldeneyes', '#C9A227', '#003DA5', 9],
    ],
    MLB: [
      ['ARI', 'Arizona Diamondbacks', '#A71930', '#E3D4AD', 109], ['ATL', 'Atlanta Braves', '#CE1141', '#13274F', 144],
      ['BAL', 'Baltimore Orioles', '#DF4601', '#000000', 110], ['BOS', 'Boston Red Sox', '#BD3039', '#0C2340', 111],
      ['CHC', 'Chicago Cubs', '#3A6FD8', '#CC3433', 112], ['CWS', 'Chicago White Sox', '#C4CED4', '#27251F', 145],
      ['CIN', 'Cincinnati Reds', '#C6011F', '#000000', 113], ['CLE', 'Cleveland Guardians', '#E31937', '#00385D', 114],
      ['COL', 'Colorado Rockies', '#8E6CC8', '#C4CED4', 115], ['DET', 'Detroit Tigers', '#FA4616', '#0C2340', 116],
      ['HOU', 'Houston Astros', '#EB6E1F', '#002D62', 117], ['KC', 'Kansas City Royals', '#4A90D9', '#BD9B60', 118],
      ['LAA', 'Los Angeles Angels', '#BA0021', '#003263', 108], ['LAD', 'Los Angeles Dodgers', '#3A7BD5', '#EF3E42', 119],
      ['MIA', 'Miami Marlins', '#00A3E0', '#EF3340', 146], ['MIL', 'Milwaukee Brewers', '#FFC52F', '#12284B', 158],
      ['MIN', 'Minnesota Twins', '#D31145', '#002B5C', 142], ['NYM', 'New York Mets', '#FF5910', '#002D72', 121],
      ['NYY', 'New York Yankees', '#C4CED4', '#003087', 147], ['ATH', 'Athletics', '#EFB21E', '#003831', 133],
      ['PHI', 'Philadelphia Phillies', '#E81828', '#002D72', 143], ['PIT', 'Pittsburgh Pirates', '#FDB827', '#27251F', 134],
      ['SD', 'San Diego Padres', '#FFC425', '#2F241D', 135], ['SF', 'San Francisco Giants', '#FD5A1E', '#27251F', 137],
      ['SEA', 'Seattle Mariners', '#00A3AD', '#0C2C56', 136], ['STL', 'St. Louis Cardinals', '#C41E3A', '#FEDB00', 138],
      ['TB', 'Tampa Bay Rays', '#8FBCE6', '#092C5C', 139], ['TEX', 'Texas Rangers', '#C0111F', '#003278', 140],
      ['TOR', 'Toronto Blue Jays', '#3A7BD5', '#E8291C', 141], ['WSH', 'Washington Nationals', '#AB0003', '#14225A', 120],
    ],
    NFL: [
      ['ARI', 'Arizona Cardinals', '#97233F', '#000000'], ['ATL', 'Atlanta Falcons', '#A71930', '#000000'],
      ['BAL', 'Baltimore Ravens', '#9E7C0C', '#241773'], ['BUF', 'Buffalo Bills', '#3A6FD8', '#C60C30'],
      ['CAR', 'Carolina Panthers', '#0085CA', '#101820'], ['CHI', 'Chicago Bears', '#C83803', '#0B162A'],
      ['CIN', 'Cincinnati Bengals', '#FB4F14', '#000000'], ['CLE', 'Cleveland Browns', '#FF3C00', '#311D00'],
      ['DAL', 'Dallas Cowboys', '#869397', '#003594'], ['DEN', 'Denver Broncos', '#FB4F14', '#002244'],
      ['DET', 'Detroit Lions', '#0076B6', '#B0B7BC'], ['GB', 'Green Bay Packers', '#FFB612', '#203731'],
      ['HOU', 'Houston Texans', '#A71930', '#03202F'], ['IND', 'Indianapolis Colts', '#A2AAAD', '#002C5F'],
      ['JAX', 'Jacksonville Jaguars', '#D7A22A', '#006778'], ['KC', 'Kansas City Chiefs', '#E31837', '#FFB81C'],
      ['LV', 'Las Vegas Raiders', '#A5ACAF', '#000000'], ['LAC', 'Los Angeles Chargers', '#0080C6', '#FFC20E'],
      ['LAR', 'Los Angeles Rams', '#FFA300', '#003594'], ['MIA', 'Miami Dolphins', '#008E97', '#FC4C02'],
      ['MIN', 'Minnesota Vikings', '#FFC62F', '#4F2683'], ['NE', 'New England Patriots', '#C60C30', '#002244'],
      ['NO', 'New Orleans Saints', '#D3BC8D', '#101820'], ['NYG', 'New York Giants', '#A71930', '#0B2265'],
      ['NYJ', 'New York Jets', '#18A86B', '#125740'], ['PHI', 'Philadelphia Eagles', '#A5ACAF', '#004C54'],
      ['PIT', 'Pittsburgh Steelers', '#FFB612', '#101820'], ['SF', 'San Francisco 49ers', '#AA0000', '#B3995D'],
      ['SEA', 'Seattle Seahawks', '#69BE28', '#002244'], ['TB', 'Tampa Bay Buccaneers', '#D50A0A', '#34302B'],
      ['TEN', 'Tennessee Titans', '#4B92DB', '#0C2340'], ['WSH', 'Washington Commanders', '#FFB612', '#5A1414'],
    ],
  };

  const LEAGUES = {
    NHL:  { name: 'NHL',  sport: 'hockey',   horn: 'Goal',      button: 'GOAL', unit: 'Goals' },
    AHL:  { name: 'AHL',  sport: 'hockey',   horn: 'Goal',      button: 'GOAL', unit: 'Goals' },
    PWHL: { name: 'PWHL', sport: 'hockey',   horn: 'Goal',      button: 'GOAL', unit: 'Goals' },
    MLB:  { name: 'MLB',  sport: 'baseball', horn: 'Run',       button: 'RUN',  unit: 'Runs' },
    NFL:  { name: 'NFL',  sport: 'football', horn: 'Touchdown', button: 'TD',   unit: 'Scoring' },
  };

  const teams = {};
  for (const [league, rows] of Object.entries(T)) {
    teams[league] = rows.map(([abbrev, name, primary, secondary, id]) => ({ abbrev, name, primary, secondary, id }));
  }

  function findTeam(league, abbrev) {
    return (teams[league] || []).find(t => t.abbrev === abbrev) || null;
  }

  const api = { LEAGUES, teams, findTeam };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GoalHornTeams = api;
})(typeof self !== 'undefined' ? self : this);
