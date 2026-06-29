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

// Returns one "example game" per insight category — the game most relevant to each pattern.
export async function getExampleGames(userId: string): Promise<{
  tactical: string | null;
  time_management: string | null;
  opening: string | null;
  recurring_blunder: string | null;
}> {
  const { data: games } = await supabase
    .from("games")
    .select("id")
    .eq("user_id", userId)
    .limit(50);

  if (!games || games.length === 0) {
    return { tactical: null, time_management: null, opening: null, recurring_blunder: null };
  }

  const ids = games.map((g) => g.id);

  // Game with most blunders → tactical + recurring_blunder
  const { data: blunderCounts } = await supabase
    .from("moves")
    .select("game_id")
    .in("game_id", ids)
    .in("classification", ["blunder", "mistake"]);

  const countByGame = new Map<string, number>();
  for (const row of blunderCounts ?? []) {
    countByGame.set(row.game_id, (countByGame.get(row.game_id) ?? 0) + 1);
  }
  const blunderGameId = [...countByGame.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // For time_management: game with the most moves (proxy for long scrambles — good enough without clock parse)
  // We reuse blunderGameId since blunders often correlate with time pressure.
  // For opening: game with worst accuracy that's in the first 15 moves blunder zone.
  const { data: openingBlunders } = await supabase
    .from("moves")
    .select("game_id")
    .in("game_id", ids)
    .in("classification", ["blunder"])
    .lte("move_number", 10);

  const openingGameCounts = new Map<string, number>();
  for (const row of openingBlunders ?? []) {
    openingGameCounts.set(row.game_id, (openingGameCounts.get(row.game_id) ?? 0) + 1);
  }
  const openingGameId = [...openingGameCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? blunderGameId;

  return {
    tactical: blunderGameId,
    time_management: blunderGameId,
    opening: openingGameId,
    recurring_blunder: blunderGameId,
  };
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
