export interface User {
  id: string;
  chess_username: string;
  created_at: string;
}

export interface Game {
  id: string;
  user_id: string;
  chess_game_id: string;
  pgn: string;
  opening: string;
  result: "win" | "loss" | "draw";
  white_rating: number;
  black_rating: number;
  time_control: string;
  accuracy: number | null;
  played_as: "white" | "black";
  created_at: string;
}

export interface Move {
  id: string;
  game_id: string;
  move_number: number;
  move: string;
  evaluation: number | null;
  centipawn_loss: number | null;
  classification: "brilliant" | "great" | "best" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder" | null;
  explanation?: string | null;
}

export interface Insight {
  id: string;
  user_id: string;
  category: "opening" | "tactical" | "time_management" | "recurring_blunder";
  message: string;
  severity: "low" | "medium" | "high";
  created_at: string;
}

export interface OpeningStat {
  id: string;
  user_id: string;
  opening_name: string;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  winrate: number;
}

export interface DashboardStats {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  winrate: number;
  avgAccuracy: number | null;
  currentRating: number | null;
}
