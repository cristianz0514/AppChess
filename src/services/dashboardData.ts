import { supabase } from "@/lib/supabase";
import type { DashboardStats, OpeningStat, Game } from "@/types";

export async function getUserId(username: string): Promise<string | null> {
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("chess_username", username.toLowerCase())
    .single();
  return data?.id ?? null;
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const { data: games } = await supabase
    .from("games")
    .select("result, accuracy, white_rating, black_rating, played_as")
    .eq("user_id", userId);

  if (!games || games.length === 0) {
    return { totalGames: 0, wins: 0, losses: 0, draws: 0, winrate: 0, avgAccuracy: null, currentRating: null };
  }

  const wins = games.filter((g) => g.result === "win").length;
  const losses = games.filter((g) => g.result === "loss").length;
  const draws = games.filter((g) => g.result === "draw").length;
  const total = games.length;

  const accuracies = games.map((g) => g.accuracy).filter((a): a is number => a !== null);
  const avgAccuracy = accuracies.length > 0
    ? Math.round((accuracies.reduce((s, a) => s + a, 0) / accuracies.length) * 10) / 10
    : null;

  const last = games[games.length - 1];
  const currentRating = last.played_as === "white" ? last.white_rating : last.black_rating;

  return {
    totalGames: total,
    wins,
    losses,
    draws,
    winrate: Math.round((wins / total) * 100 * 10) / 10,
    avgAccuracy,
    currentRating,
  };
}

export async function getTopOpenings(userId: string): Promise<OpeningStat[]> {
  const { data } = await supabase
    .from("opening_stats")
    .select("*")
    .eq("user_id", userId)
    .order("games_played", { ascending: false })
    .limit(8);
  return data ?? [];
}

export interface ColorStats {
  winrate: number;
  wins: number;
  losses: number;
  draws: number;
  games: number;
}

export async function getColorStats(userId: string): Promise<{ white: ColorStats; black: ColorStats }> {
  const { data: games } = await supabase
    .from("games")
    .select("result, played_as")
    .eq("user_id", userId);

  const empty = (): ColorStats => ({ winrate: 0, wins: 0, losses: 0, draws: 0, games: 0 });

  if (!games || games.length === 0) return { white: empty(), black: empty() };

  const calc = (color: "white" | "black"): ColorStats => {
    const filtered = games.filter((g) => g.played_as === color);
    if (filtered.length === 0) return empty();
    const wins   = filtered.filter((g) => g.result === "win").length;
    const losses = filtered.filter((g) => g.result === "loss").length;
    const draws  = filtered.filter((g) => g.result === "draw").length;
    return {
      wins, losses, draws,
      games: filtered.length,
      winrate: Math.round((wins / filtered.length) * 100),
    };
  };

  return { white: calc("white"), black: calc("black") };
}

export interface RecentGame {
  id: string;
  opening: string;
  result: Game["result"];
  accuracy: number | null;
  played_as: "white" | "black";
  white_rating: number;
  black_rating: number;
  time_control: string;
  created_at: string;
}

export async function getRecentGames(userId: string, limit = 20): Promise<RecentGame[]> {
  const { data } = await supabase
    .from("games")
    .select("id, opening, result, accuracy, played_as, white_rating, black_rating, time_control, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as RecentGame[];
}
