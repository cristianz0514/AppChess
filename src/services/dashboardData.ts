import { cache } from "react";
import { supabase } from "@/lib/supabase";
import { endedByAbandonment } from "./pgnParser";
import type { DashboardStats, OpeningStat, Game } from "@/types";

export const getUserId = cache(async function(username: string): Promise<string | null> {
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("chess_username", username.toLowerCase())
    .single();
  return data?.id ?? null;
});

export const getDashboardStats = cache(async function(userId: string): Promise<DashboardStats> {
  const { data: games } = await supabase
    .from("games")
    .select("result, accuracy, white_rating, black_rating, played_as, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

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

  // games are ordered most-recent-first, so [0] is the latest game played
  const latest = games[0];
  const currentRating = latest.played_as === "white" ? latest.white_rating : latest.black_rating;

  return {
    totalGames: total,
    wins,
    losses,
    draws,
    winrate: Math.round((wins / total) * 100 * 10) / 10,
    avgAccuracy,
    currentRating,
  };
});

export const getTopOpenings = cache(async function(userId: string): Promise<OpeningStat[]> {
  const { data } = await supabase
    .from("opening_stats")
    .select("*")
    .eq("user_id", userId)
    .order("games_played", { ascending: false })
    .limit(8);
  return data ?? [];
});

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

export interface ExampleGame {
  id: string;
  opening: string;
  result: "win" | "loss" | "draw";
  errorCount: number;
}

export interface ExampleGamesMap {
  tactical:          ExampleGame[];
  time_management:   ExampleGame[];
  opening:           ExampleGame[];
  recurring_blunder: ExampleGame[];
}

// Returns up to 5 representative games per insight category.
export async function getExampleGames(userId: string): Promise<ExampleGamesMap> {
  const empty = (): ExampleGame[] => [];
  const emptyMap = (): ExampleGamesMap => ({
    tactical: empty(), time_management: empty(), opening: empty(), recurring_blunder: empty(),
  });

  const { data: games } = await supabase
    .from("games")
    .select("id, opening, result")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!games || games.length === 0) return emptyMap();

  const ids = games.map((g) => g.id);
  const gameInfo = new Map(games.map((g) => [g.id, { opening: g.opening ?? "Desconocido", result: g.result as "win" | "loss" | "draw" }]));

  // Fetch all error moves with phase info so we can build distinct lists per category.
  const { data: errorMoves } = await supabase
    .from("moves")
    .select("game_id, move_number, classification")
    .in("game_id", ids)
    .in("classification", ["blunder", "mistake"]);

  // Tally errors per game by phase / severity.
  const tacticalCount  = new Map<string, number>(); // blunders only (severe tactical lapses)
  const recurringCount = new Map<string, number>(); // all errors (blunders + mistakes)
  const openingCount   = new Map<string, number>(); // errors in the opening (move ≤ 10)
  const lateCount      = new Map<string, number>(); // errors in the endgame (move > 25), proxy for time scrambles

  const bump = (map: Map<string, number>, id: string) => map.set(id, (map.get(id) ?? 0) + 1);

  for (const row of errorMoves ?? []) {
    recurringCount.set(row.game_id, (recurringCount.get(row.game_id) ?? 0) + 1);
    if (row.classification === "blunder") bump(tacticalCount, row.game_id);
    if (row.move_number <= 10) bump(openingCount, row.game_id);
    if (row.move_number > 25)  bump(lateCount, row.game_id);
  }

  function topGames(countMap: Map<string, number>, limit = 5): ExampleGame[] {
    return [...countMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, count]) => ({
        id,
        opening: gameInfo.get(id)?.opening ?? "Desconocido",
        result: gameInfo.get(id)?.result ?? "draw",
        errorCount: count,
      }));
  }

  return {
    tactical:          topGames(tacticalCount),
    recurring_blunder: topGames(recurringCount),
    opening:           topGames(openingCount),
    time_management:   topGames(lateCount),
  };
}

export interface HighlightGame {
  id: string;
  opening: string;
  result: "win" | "loss" | "draw";
  accuracy: number | null;
  errorCount: number;
  played_as: "white" | "black";
}

export interface HighlightGames {
  best:       HighlightGame | null;
  worst:      HighlightGame | null;
  mostErrors: HighlightGame | null;
}

export const getHighlightGames = cache(async function(userId: string): Promise<HighlightGames> {
  const { data: games } = await supabase
    .from("games")
    .select("id, opening, result, accuracy, played_as")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!games || games.length === 0) return { best: null, worst: null, mostErrors: null };

  const ids = games.map((g) => g.id);

  const { data: moveRows } = await supabase
    .from("moves")
    .select("game_id")
    .in("game_id", ids)
    .in("classification", ["blunder", "mistake"]);

  const errorCount = new Map<string, number>();
  for (const row of moveRows ?? []) {
    errorCount.set(row.game_id, (errorCount.get(row.game_id) ?? 0) + 1);
  }

  type GameRow = { id: string; opening: string | null; result: string; accuracy: number | null; played_as: string };
  function toHighlight(g: GameRow): HighlightGame {
    return {
      id: g.id,
      opening: g.opening ?? "Apertura Desconocida",
      result: g.result as "win" | "loss" | "draw",
      accuracy: g.accuracy,
      errorCount: errorCount.get(g.id) ?? 0,
      played_as: g.played_as as "white" | "black",
    };
  }

  // Best: highest accuracy among games with accuracy data; fallback: fewest errors
  const withAccuracy = games.filter((g) => g.accuracy !== null);
  const best = withAccuracy.length > 0
    ? toHighlight(withAccuracy.reduce((a, b) => (b.accuracy! > a.accuracy! ? b : a)))
    : toHighlight(games.reduce((a, b) => ((errorCount.get(b.id) ?? 0) < (errorCount.get(a.id) ?? 0) ? b : a)));

  // Worst: lowest accuracy; fallback: most errors
  const worst = withAccuracy.length > 0
    ? toHighlight(withAccuracy.reduce((a, b) => (b.accuracy! < a.accuracy! ? b : a)))
    : toHighlight(games.reduce((a, b) => ((errorCount.get(b.id) ?? 0) > (errorCount.get(a.id) ?? 0) ? b : a)));

  // Most errors (blunders + mistakes combined)
  const mostErrors = toHighlight(
    games.reduce((a, b) => ((errorCount.get(b.id) ?? 0) > (errorCount.get(a.id) ?? 0) ? b : a))
  );

  return { best, worst, mostErrors };
});

export interface OpeningWithGames {
  opening_name: string;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  winrate: number;
}

export async function getOpeningsByColor(
  userId: string,
  color: "white" | "black" | "both"
): Promise<OpeningWithGames[]> {
  let query = supabase
    .from("games")
    .select("opening, result, played_as")
    .eq("user_id", userId)
    .not("opening", "is", null);

  if (color !== "both") {
    query = query.eq("played_as", color);
  }

  const { data: games } = await query;
  if (!games || games.length === 0) return [];

  const map = new Map<string, { wins: number; losses: number; draws: number }>();
  for (const g of games) {
    const key = g.opening as string;
    if (!map.has(key)) map.set(key, { wins: 0, losses: 0, draws: 0 });
    const s = map.get(key)!;
    if (g.result === "win") s.wins++;
    else if (g.result === "loss") s.losses++;
    else s.draws++;
  }

  return [...map.entries()]
    .map(([opening_name, s]) => {
      const total = s.wins + s.losses + s.draws;
      return {
        opening_name,
        games_played: total,
        wins: s.wins,
        losses: s.losses,
        draws: s.draws,
        winrate: total > 0 ? Math.round((s.wins / total) * 100 * 100) / 100 : 0,
      };
    })
    .filter((o) => o.games_played >= 2)
    .sort((a, b) => b.games_played - a.games_played)
    .slice(0, 20);
}

export async function getGamesByOpening(
  userId: string,
  openingName: string
): Promise<RecentGame[]> {
  const { data } = await supabase
    .from("games")
    .select("id, opening, result, accuracy, played_as, white_rating, black_rating, time_control, created_at")
    .eq("user_id", userId)
    .eq("opening", openingName)
    .order("created_at", { ascending: false });
  return (data ?? []) as RecentGame[];
}

// Returns IDs of the user's games that have no analyzed moves yet (most recent first).
export async function getUnanalyzedGameIds(userId: string, limit = 50): Promise<string[]> {
  const { data: games } = await supabase
    .from("games")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!games || games.length === 0) return [];
  const allIds = games.map((g) => g.id);

  const { data: analyzedRows } = await supabase
    .from("moves")
    .select("game_id")
    .in("game_id", allIds);

  const analyzed = new Set((analyzedRows ?? []).map((r) => r.game_id));
  return allIds.filter((id) => !analyzed.has(id));
}

export interface ResultStats {
  wins: number;
  losses: number;
  draws: number;
  winrate: number;       // % over counted games
  excluded: number;      // games dropped (abandonment in a roughly-equal position)
  counted: number;
}

// Win/loss/draw counts that IGNORE games decided by a disconnection/abandonment
// unless the result was actually backed by the position. The rule is directional:
//   • a WIN counts only if you had a real advantage (myEval ≥ +2 pawns)
//   • a LOSS counts only if you were really worse (myEval ≤ −2 pawns)
// Anything else that ended by abandonment (roughly equal, or — crucially — a win
// you got while you were actually losing because the rival just left) is excluded.
// Games without analysis (no final eval) keep their original result.
export const getResultStats = cache(async function(userId: string): Promise<ResultStats> {
  const { data: games } = await supabase
    .from("games")
    .select("id, result, played_as, pgn")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!games || games.length === 0) {
    return { wins: 0, losses: 0, draws: 0, winrate: 0, excluded: 0, counted: 0 };
  }

  // Only abandonment games need an eval check — fetch their final eval only.
  const abandonIds = games
    .filter((g) => endedByAbandonment(g.pgn) && (g.result === "win" || g.result === "loss"))
    .map((g) => g.id);

  const finalEval = new Map<string, { mv: number; eval: number }>();
  if (abandonIds.length > 0) {
    const { data: moveRows } = await supabase
      .from("moves")
      .select("game_id, move_number, evaluation")
      .in("game_id", abandonIds)
      .not("evaluation", "is", null);

    for (const r of moveRows ?? []) {
      const cur = finalEval.get(r.game_id);
      if (!cur || r.move_number > cur.mv) finalEval.set(r.game_id, { mv: r.move_number, eval: r.evaluation as number });
    }
  }

  let wins = 0, losses = 0, draws = 0, excluded = 0;
  const THRESHOLD = 2; // pawns of advantage that make the result "earned"

  for (const g of games) {
    if (endedByAbandonment(g.pgn) && (g.result === "win" || g.result === "loss")) {
      const fin = finalEval.get(g.id);
      if (fin) {
        // eval is white-perspective; convert to "my" perspective.
        const myEval = g.played_as === "white" ? fin.eval : -fin.eval;
        const earned =
          (g.result === "win"  && myEval >=  THRESHOLD) ||
          (g.result === "loss" && myEval <= -THRESHOLD);
        if (!earned) { excluded++; continue; }
      }
    }
    if (g.result === "win") wins++;
    else if (g.result === "loss") losses++;
    else draws++;
  }

  const counted = wins + losses + draws;
  return {
    wins, losses, draws, excluded, counted,
    winrate: counted > 0 ? Math.round((wins / counted) * 100 * 10) / 10 : 0,
  };
});

export interface EloPoint {
  index: number;        // game number in chronological order (1-based)
  date: string;         // ISO date of the game
  elo: number;          // player's rating in that game
  opponentElo: number;  // opponent's rating in that game
}

// Returns the player's ELO across games, oldest → newest, for an evolution chart.
export const getEloHistory = cache(async function(userId: string, limit = 500): Promise<EloPoint[]> {
  const { data } = await supabase
    .from("games")
    .select("white_rating, black_rating, played_as, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (!data || data.length === 0) return [];

  return data
    .map((g, i) => {
      const isWhite = g.played_as === "white";
      const elo = isWhite ? g.white_rating : g.black_rating;
      const opponentElo = isWhite ? g.black_rating : g.white_rating;
      return { index: i + 1, date: g.created_at, elo, opponentElo };
    })
    .filter((p) => typeof p.elo === "number" && p.elo > 0);
});

export async function getRecentGames(userId: string, limit = 20): Promise<RecentGame[]> {
  const { data } = await supabase
    .from("games")
    .select("id, opening, result, accuracy, played_as, white_rating, black_rating, time_control, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as RecentGame[];
}
