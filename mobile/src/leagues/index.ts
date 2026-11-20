import type { LeagueId } from '../teams';
import type { LeagueAdapter } from '../types';
import { nhl } from './nhl';
import { ahl, pwhl } from './hockeytech';
import { mlb } from './mlb';
import { nfl } from './nfl';

export const leagues: Record<LeagueId, LeagueAdapter> = { NHL: nhl, AHL: ahl, PWHL: pwhl, MLB: mlb, NFL: nfl };
