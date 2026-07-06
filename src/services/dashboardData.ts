import { cache } from "react";
import { supabase } from "@/lib/supabase";
import type { DashboardStats, OpeningStat, Game } from "@/types";

export const getUserId = cache(async function(username: string): Promise<string | null> {
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("chess_username", username.toLowerCase())
    .single();
  return data?.id ?? null;
});

// Whether the new schema columns (time_class / played_at / ended_by_abandonment)
// exist. If a deploy runs before the migration, everything must still work — so
// we detect it once (per request) and fall back to legacy queries when absent.
export const hasModernSchema = cache(async function(): Promise<boolean> {
  const { error } = await supabase.from("games").select("played_at").limit(1);
  return !error;
});

// Order games by real play date when available, else by import time.
async function gameOrderCol(): Promise<"played_at" | "created_at"> {
  return (await hasModernSchema()) ? "played_at" : "created_at";
}

// Whether a chosen class actually filters (undefined/"all" → mixed, all games).
const filtersClass = (tc?: string) => !!tc && tc !== "all" && tc !== "unknown";

// Count games in the DB (exact, no 1000-row transfer cap) with optional filters.
// Essential at scale: some accounts have thousands of games, so we must NOT
// fetch every row and count in JS (PostgREST caps responses at 1000 rows).
async function countGames(
  userId: string,
  opts: { timeClass?: string; result?: string; playedAs?: string } = {},
): Promise<number> {
  let q = supabase.from("games").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (filtersClass(opts.timeClass)) q = q.eq("time_class", opts.timeClass!);
  if (opts.timeClass === "unknown") q = q.is("time_class", null);
  if (opts.result) q = q.eq("result", opts.result);
  if (opts.playedAs) q = q.eq("played_as", opts.playedAs);
  const { count } = await q;
  return count ?? 0;
}

// Default time control for the dashboard: the most-played real class. If games
// aren't classified yet (pre-reimport, all null → "unknown"), fall back to "all"
// so stats aren't filtered to a value that matches no rows (empty dashboard).
export function pickDefaultClass(classes: { time_class: string; count: number }[]): string {
  const top = classes[0];
  return top && top.time_class !== "unknown" ? top.time_class : "all";
}

// Distinct time controls the player has games in, with counts (most-played first).
export const getTimeClasses = cache(async function(userId: string): Promise<{ time_class: string; count: number }[]> {
  if (!(await hasModernSchema())) return []; // column absent → no separation yet
  // Count each known class exactly (not by sampling rows — that misses classes
  // beyond the first 1000 games, which is exactly how the selector "died").
  const CLASSES = ["blitz", "rapid", "bullet", "daily", "unknown"];
  const results = await Promise.all(
    CLASSES.map(async (tc) => ({ time_class: tc, count: await countGames(userId, { timeClass: tc }) })),
  );
  return results.filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
});

export const getDashboardStats = cache(async function(userId: string, timeClass?: string): Promise<DashboardStats> {
  // Counts computed in the DB (scales to thousands of games; no 1000-row cap).
  const [wins, losses, draws] = await Promise.all([
    countGames(userId, { timeClass, result: "win" }),
    countGames(userId, { timeClass, result: "loss" }),
    countGames(userId, { timeClass, result: "draw" }),
  ]);
  const total = wins + losses + draws;
  if (total === 0) {
    return { totalGames: 0, wins: 0, losses: 0, draws: 0, winrate: 0, avgAccuracy: null, currentRating: null };
  }

  // Current rating: the player's rating in their most recent game of this class.
  let rq = supabase.from("games").select("white_rating, black_rating, played_as").eq("user_id", userId);
  if (filtersClass(timeClass)) rq = rq.eq("time_class", timeClass!);
  const { data: latestRows } = await rq.order(await gameOrderCol(), { ascending: false, nullsFirst: false }).limit(1);
  const latest = latestRows?.[0];
  const currentRating = latest ? (latest.played_as === "white" ? latest.white_rating : latest.black_rating) : null;

  // Average accuracy over ANALYZED games only (a bounded set — most games are
  // unanalyzed, so this stays well under the row cap).
  let aq = supabase.from("games").select("accuracy").eq("user_id", userId).not("accuracy", "is", null);
  if (filtersClass(timeClass)) aq = aq.eq("time_class", timeClass!);
  const { data: accRows } = await aq.limit(1000);
  const accuracies = (accRows ?? []).map((r) => r.accuracy as number).filter((a) => a !== null);
  const avgAccuracy = accuracies.length > 0
    ? Math.round((accuracies.reduce((s, a) => s + a, 0) / accuracies.length) * 10) / 10
    : null;

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

// Openings computed live from games, filtered by time class (the opening_stats
// table is aggregated across ALL time controls, so it can't answer per-class).
export async function getTopOpeningsByClass(userId: string, timeClass?: string): Promise<OpeningStat[]> {
  let q = supabase
    .from("games")
    .select("opening, result")
    .eq("user_id", userId)
    .not("opening", "is", null);
  if (filtersClass(timeClass)) q = q.eq("time_class", timeClass!);
  const { data: games } = await q;
  if (!games || games.length === 0) return [];

  const map = new Map<string, { wins: number; losses: number; draws: number }>();
  for (const g of games) {
    const key = (g.opening as string) ?? "Unknown";
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
        id: opening_name, user_id: userId, opening_name,
        games_played: total, wins: s.wins, losses: s.losses, draws: s.draws,
        winrate: total > 0 ? Math.round((s.wins / total) * 100 * 100) / 100 : 0,
      } as OpeningStat;
    })
    .sort((a, b) => b.games_played - a.games_played)
    .slice(0, 8);
}

export interface ColorStats {
  winrate: number;
  wins: number;
  losses: number;
  draws: number;
  games: number;
}

export async function getColorStats(userId: string, timeClass?: string): Promise<{ white: ColorStats; black: ColorStats }> {
  const empty = (): ColorStats => ({ winrate: 0, wins: 0, losses: 0, draws: 0, games: 0 });

  const calc = async (color: "white" | "black"): Promise<ColorStats> => {
    const [wins, losses, draws] = await Promise.all([
      countGames(userId, { timeClass, playedAs: color, result: "win" }),
      countGames(userId, { timeClass, playedAs: color, result: "loss" }),
      countGames(userId, { timeClass, playedAs: color, result: "draw" }),
    ]);
    const games = wins + losses + draws;
    if (games === 0) return empty();
    return { wins, losses, draws, games, winrate: Math.round((wins / games) * 100) };
  };

  const [white, black] = await Promise.all([calc("white"), calc("black")]);
  return { white, black };
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
  time_class: string | null;
  created_at: string;
  played_at: string | null;
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
    .order("played_at", { ascending: false, nullsFirst: false })
    .limit(200);

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

export const getHighlightGames = cache(async function(userId: string, timeClass?: string): Promise<HighlightGames> {
  // Only ANALYZED games matter here (accuracy + move errors). That's a bounded
  // set even when the account has thousands of games, so no row-cap problem.
  let q = supabase
    .from("games")
    .select("id, opening, result, accuracy, played_as")
    .eq("user_id", userId)
    .not("accuracy", "is", null);
  if (filtersClass(timeClass)) q = q.eq("time_class", timeClass!);
  const { data: games } = await q.order(await gameOrderCol(), { ascending: false, nullsFirst: false }).limit(1000);

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

  const withAccuracy = games.filter((g) => g.accuracy !== null);

  // Best = your highest-accuracy WIN (a "best game" shouldn't be a loss).
  // Fall back to best-accuracy overall only if there are no analyzed wins.
  const winsAcc = withAccuracy.filter((g) => g.result === "win");
  const best = winsAcc.length > 0
    ? toHighlight(winsAcc.reduce((a, b) => (b.accuracy! > a.accuracy! ? b : a)))
    : withAccuracy.length > 0
      ? toHighlight(withAccuracy.reduce((a, b) => (b.accuracy! > a.accuracy! ? b : a)))
      : null;

  // Worst = your lowest-accuracy LOSS. Fall back to worst-accuracy overall.
  const lossesAcc = withAccuracy.filter((g) => g.result === "loss");
  const worst = lossesAcc.length > 0
    ? toHighlight(lossesAcc.reduce((a, b) => (b.accuracy! < a.accuracy! ? b : a)))
    : withAccuracy.length > 0
      ? toHighlight(withAccuracy.reduce((a, b) => (b.accuracy! < a.accuracy! ? b : a)))
      : null;

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
  const modern = await hasModernSchema();
  const base = "id, opening, result, accuracy, played_as, white_rating, black_rating, time_control, created_at";
  const { data } = await supabase
    .from("games")
    .select(modern ? `${base}, time_class, played_at` : base)
    .eq("user_id", userId)
    .eq("opening", openingName)
    .order(modern ? "played_at" : "created_at", { ascending: false, nullsFirst: false });
  return (data ?? []) as unknown as RecentGame[];
}

// Returns IDs of the user's games that have no analyzed moves yet (most recent first).
export async function getUnanalyzedGameIds(userId: string, limit = 50): Promise<string[]> {
  const { data: games } = await supabase
    .from("games")
    .select("id")
    .eq("user_id", userId)
    .order(await gameOrderCol(), { ascending: false, nullsFirst: false })
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
export const getResultStats = cache(async function(userId: string, timeClass?: string): Promise<ResultStats> {
  // Base W/L/D from exact DB counts (scales to thousands of games).
  const [wins0, losses0, draws] = await Promise.all([
    countGames(userId, { timeClass, result: "win" }),
    countGames(userId, { timeClass, result: "loss" }),
    countGames(userId, { timeClass, result: "draw" }),
  ]);

  let wins = wins0, losses = losses0, excluded = 0;
  const modern = await hasModernSchema();

  // Only ANALYZED abandonment games (win/loss) can be excluded — a tiny set.
  if (modern) {
    let aq = supabase
      .from("games")
      .select("id, result, played_as")
      .eq("user_id", userId)
      .eq("ended_by_abandonment", true)
      .in("result", ["win", "loss"])
      .not("accuracy", "is", null);
    if (filtersClass(timeClass)) aq = aq.eq("time_class", timeClass!);
    const { data: abGames } = await aq.limit(1000);

    if (abGames && abGames.length > 0) {
      const finalEval = new Map<string, { mv: number; eval: number }>();
      const { data: moveRows } = await supabase
        .from("moves")
        .select("game_id, move_number, evaluation")
        .in("game_id", abGames.map((g) => g.id))
        .not("evaluation", "is", null);
      for (const r of moveRows ?? []) {
        const cur = finalEval.get(r.game_id);
        if (!cur || r.move_number > cur.mv) finalEval.set(r.game_id, { mv: r.move_number, eval: r.evaluation as number });
      }
      const THRESHOLD = 2; // pawns of advantage that make the result "earned"
      for (const g of abGames) {
        const fin = finalEval.get(g.id);
        if (!fin) continue; // no eval → keep the original result
        const myEval = g.played_as === "white" ? fin.eval : -fin.eval;
        const earned =
          (g.result === "win"  && myEval >=  THRESHOLD) ||
          (g.result === "loss" && myEval <= -THRESHOLD);
        if (!earned) {
          excluded++;
          if (g.result === "win") wins--; else losses--;
        }
      }
    }
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
export const getEloHistory = cache(async function(userId: string, timeClass?: string, limit = 1000): Promise<EloPoint[]> {
  const modern = await hasModernSchema();
  const orderCol = modern ? "played_at" : "created_at";
  let q = supabase
    .from("games")
    .select(modern ? "white_rating, black_rating, played_as, played_at, created_at" : "white_rating, black_rating, played_as, created_at")
    .eq("user_id", userId);
  if (filtersClass(timeClass)) q = q.eq("time_class", timeClass!);
  // Take the most-recent `limit` games (desc), then flip to chronological order
  // so the chart reads left→right oldest→newest even with thousands of games.
  const { data } = await q.order(orderCol, { ascending: false, nullsFirst: false }).limit(limit);

  if (!data || data.length === 0) return [];

  return (data as unknown as Array<{ white_rating: number; black_rating: number; played_as: string; played_at?: string; created_at: string }>)
    .slice()
    .reverse()
    .map((g, i) => {
      const isWhite = g.played_as === "white";
      const elo = isWhite ? g.white_rating : g.black_rating;
      const opponentElo = isWhite ? g.black_rating : g.white_rating;
      return { index: i + 1, date: (g.played_at ?? g.created_at) as string, elo, opponentElo };
    })
    .filter((p) => typeof p.elo === "number" && p.elo > 0);
});

export async function getRecentGames(userId: string, limit = 20, timeClass?: string): Promise<RecentGame[]> {
  const modern = await hasModernSchema();
  const base = "id, opening, result, accuracy, played_as, white_rating, black_rating, time_control, created_at";
  let q = supabase
    .from("games")
    .select(modern ? `${base}, time_class, played_at` : base)
    .eq("user_id", userId);
  if (filtersClass(timeClass)) q = q.eq("time_class", timeClass!);
  const { data } = await q
    .order(modern ? "played_at" : "created_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []) as unknown as RecentGame[];
}
