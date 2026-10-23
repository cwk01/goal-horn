const nhl = require('./nhl');
const ht = require('./hockeytech');
const mlb = require('./mlb');
const nfl = require('./nfl');

module.exports = { NHL: nhl, AHL: ht.AHL, PWHL: ht.PWHL, MLB: mlb, NFL: nfl };
