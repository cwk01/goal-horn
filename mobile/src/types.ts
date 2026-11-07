import type { LeagueId } from './teams';

export type GameState = 'FUT' | 'LIVE' | 'FINAL';

export interface Side {
  abbrev: string;
  name: string;
  logo: string;
  score: number;
  id?: string;
}

export interface ScoringPlay {
  team: string;
  text: string;
  playerId?: number | null;
  period: number;
  periodLabel: string;
  time: string;
  badge: string | null;
}

export interface Situation {
  text: string;
  possession: string | null;
  redZone: boolean;
  lastPlay: string;
}

// Every league adapter returns games in this shape.
export interface Game {
  id: string | number;
  league: LeagueId;
  state: GameState;
  start: string | null;     // ISO time, when the feed has one
  dateText?: string;        // AHL/PWHL give a date string instead
  venue: string;
  status: string;
  period: number;
  intermission: boolean;
  periods: string[];
  home: Side;
  away: Side;
  scoring: ScoringPlay[];
  situation?: Situation | null;
}

export interface LeagueAdapter {
  today(team: string): Promise<Game | null>;
  next(team: string): Promise<Game | null>;
  // The team's most recent finished game, with its scoring plays.
  last(team: string): Promise<Game | null>;
}
