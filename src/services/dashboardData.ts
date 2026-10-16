import { cache } from "react";
import { supabase } from "@/lib/supabase";
import { isChampionBattle, isOwnRow } from "@/lib/ownGames";
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

// Whether `moves.ply` exists (migration 006). It is what tells the player's moves from the
// rival's; without it every row is counted as before rather than failing the whole query.
export const hasPlyColumn = cache(async function(): Promise<boolean> {
  const { error } = await supabase.from("moves").select("ply").limit(1);
  return !error;
});

// Reads move rows of many games. PostgREST answers at most 1000 rows per request and a long
// `in (...)` list overflows the URL, so a single query over dozens of games silently returned
// only the first thousand moves (a handful of games) and every total built on it was short.
// Games go in chunks, each chunk paged in a stable order, so the rows are all of them.
const MOVES_PAGE = 1000;
const GAMES_PER_REQUEST = 100;

export async function getMovesOfGames<T>(
  gameIds: readonly string[],
  columns: string,
  where: { classes?: readonly string[]; moveNumber?: number } = {},
): Promise<T[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < gameIds.length; i += GAMES_PER_REQUEST) chunks.push(gameIds.slice(i, i + GAMES_PER_REQUEST));

  const readChunk = async (ids: string[]): Promise<T[]> => {
    const out: T[] = [];
    for (let from = 0; ; from += MOVES_PAGE) {
      let q = supabase.from("moves").select(columns).in("game_id", ids);
      if (where.classes) q = q.in("classification", [...where.classes]);
      if (where.moveNumber != null) q = q.eq("move_number", where.moveNumber);
      const { data } = await q.order("id").range(from, from + MOVES_PAGE - 1);
      const rows = (data ?? []) as unknown as T[];
      out.push(...rows);
      if (rows.length < MOVES_PAGE) break;
    }
    return out;
  };

  return (await Promise.all(chunks.map(readChunk))).flat();
}

// Order games by real play date when available, else by import time.
async function gameOrderCol(): Promise<"played_at" | "created_at"> {
  return (await hasModernSchema()) ? "played_at" : "created_at";
}

// Whether a chosen class actually filters (undefined/"all" → mixed, all games).
const filtersClass = (tc?: string) => !!tc && tc !== "all";

// "unknown" is the chip for games with no usable time class: stored as null (imported before the
// column existed) or as the literal "unknown". Picking it has to show exactly those games, not all.
const UNKNOWN_CLASS = "time_class.is.null,time_class.eq.unknown";

// ── Shared bounded window ────────────────────────────────────────────────────
// The dashboard (and Aperturas) scope to the user's most recent 1000 games.
// Accounts can have thousands of games (full-history import), and fetching
// every row — or issuing a dozen+ separate queries per page load — made
// navigation feel frozen. Every dashboard stat is now derived, in memory, from
// ONE bounded fetch instead of many round-trips to Supabase.
export const DASHBOARD_WINDOW = 1000;

export interface GameWindowRow {
  id: string;
  opening: string | null;
  result: "win" | "loss" | "draw";
  accuracy: number | null;
  played_as: "white" | "black";
  white_rating: number;
  black_rating: number;
  time_control: string;
  time_class: string | null;
  ended_by_abandonment: boolean;
  played_at: string | null;
  created_at: string;
  // Champion-battle games (Nacimiento de un Campeón) get a synthetic
  // "campeones-{championId}-{chapterId}-{userId}-{ts}" id instead of a real
  // chess.com one (see api/champions/analyze) — this is how callers tell
  // them apart from real imported games.
  chess_game_id: string | null;
}

// Champion battles are left out unless asked for: they have no rating, no time class and
// no chess.com opponent, so they would skew the rating, win-rate and opening figures (and
// sort first, because their played_at is empty). Only the games list shows them.
export const getGameWindow = cache(async function(
  userId: string,
  timeClass?: string,
  limit = DASHBOARD_WINDOW,
  includeChampions = false,
): Promise<GameWindowRow[]> {
  const modern = await hasModernSchema();
  const base = "id, opening, result, accuracy, played_as, white_rating, black_rating, time_control, created_at, chess_game_id";
  let q = supabase
    .from("games")
    .select(modern ? `${base}, time_class, ended_by_abandonment, played_at` : base)
    .eq("user_id", userId);
  if (modern && filtersClass(timeClass)) q = timeClass === "unknown" ? q.or(UNKNOWN_CLASS) : q.eq("time_class", timeClass!);
  // NULLS FIRST matches the games_user_played_at_idx index (created as `desc`,
  // Postgres' default is nulls-first) — NULLS LAST forces a full sort instead
  // of an index scan and was ~3-4x slower on a large account (measured).
  const { data } = await q
    .order(modern ? "played_at" : "created_at", { ascending: false, nullsFirst: true })
    .limit(limit);

  return ((data ?? []) as unknown as Partial<GameWindowRow>[])
    .filter((g) => includeChampions || !isChampionBattle(g.chess_game_id))
    .map((g) => ({
      id: g.id!,
      opening: g.opening ?? null,
      result: g.result as "win" | "loss" | "draw",
      accuracy: g.accuracy ?? null,
      played_as: g.played_as as "white" | "black",
      white_rating: g.white_rating ?? 0,
      black_rating: g.black_rating ?? 0,
      time_control: g.time_control ?? "",
      time_class: g.time_class ?? null,
      ended_by_abandonment: g.ended_by_abandonment ?? false,
      played_at: g.played_at ?? null,
      chess_game_id: g.chess_game_id ?? null,
      created_at: g.created_at!,
    }));
});

// The time controls the player has games in, with how many each one shows (most-played first).
// A chip's number is what its page shows: the player's games of that class, up to the last 1000
// that every dashboard figure is computed over. It used to count the classes inside the last
// 1000 games OF ANY CLASS, so a chip said 988 while its own page, which reads the last 1000 of
// that class, said 1000.
export const getTimeClasses = cache(async function(userId: string): Promise<{ time_class: string; count: number }[]> {
  if (!(await hasModernSchema())) return []; // column absent → no separation yet
  const named = new Set<string>(["blitz", "rapid", "bullet", "daily"]);
  for (const g of await getGameWindow(userId, undefined, DASHBOARD_WINDOW)) {
    if (g.time_class && g.time_class !== "unknown") named.add(g.time_class);
  }
  const countOf = async (tc: string) => {
    let q = supabase.from("games").select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("chess_game_id", "like", "campeones-%");
    q = tc === "unknown" ? q.or(UNKNOWN_CLASS) : q.eq("time_class", tc);
    const { count } = await q;
    return { time_class: tc, count: Math.min(count ?? 0, DASHBOARD_WINDOW) };
  };
  return (await Promise.all([...named, "unknown"].map(countOf)))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
});

// Default time control for the dashboard: the most-played real class. If games
// aren't classified yet (pre-reimport, all null → "unknown"), fall back to "all"
// so stats aren't filtered to a value that matches no rows (empty dashboard).
export function pickDefaultClass(classes: { time_class: string; count: number }[]): string {
  const top = classes[0];
  return top && top.time_class !== "unknown" ? top.time_class : "all";
}

export const getDashboardStats = cache(async function(userId: string, timeClass?: string): Promise<DashboardStats> {
  const rows = await getGameWindow(userId, timeClass);
  if (rows.length === 0) {
    return { totalGames: 0, wins: 0, losses: 0, draws: 0, winrate: 0, avgAccuracy: null, currentRating: null };
  }

  const wins = rows.filter((g) => g.result === "win").length;
  const losses = rows.filter((g) => g.result === "loss").length;
  const draws = rows.filter((g) => g.result === "draw").length;
  const total = rows.length;

  const accuracies = rows.map((g) => g.accuracy).filter((a): a is number => a !== null);
  const avgAccuracy = accuracies.length > 0
    ? Math.round((accuracies.reduce((s, a) => s + a, 0) / accuracies.length) * 10) / 10
    : null;

  // rows are ordered most-recent-first, so [0] is the latest game played
  const latest = rows[0];
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

function aggregateOpenings(rows: { opening: string | null; result: string }[], userId: string): OpeningStat[] {
  const map = new Map<string, { wins: number; losses: number; draws: number }>();
  for (const g of rows) {
    if (!g.opening) continue;
    const key = g.opening;
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

// Openings computed from the last-1000 window, filtered by time class (the
// opening_stats table is aggregated across ALL time controls, so it can't
// answer per-class, and the raw games table can hold thousands of rows).
export async function getTopOpeningsByClass(userId: string, timeClass?: string): Promise<OpeningStat[]> {
  const rows = await getGameWindow(userId, timeClass);
  return aggregateOpenings(rows, userId);
}

export interface ColorStats {
  winrate: number;
  wins: number;
  losses: number;
  draws: number;
  games: number;
}

export async function getColorStats(userId: string, timeClass?: string): Promise<{ white: ColorStats; black: ColorStats }> {
  const rows = await getGameWindow(userId, timeClass);
  const empty = (): ColorStats => ({ winrate: 0, wins: 0, losses: 0, draws: 0, games: 0 });

  const calc = (color: "white" | "black"): ColorStats => {
    const filtered = rows.filter((g) => g.played_as === color);
    if (filtered.length === 0) return empty();
    const wins   = filtered.filter((g) => g.result === "win").length;
    const losses = filtered.filter((g) => g.result === "loss").length;
    const draws  = filtered.filter((g) => g.result === "draw").length;
    return { wins, losses, draws, games: filtered.length, winrate: Math.round((wins / filtered.length) * 100) };
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
  time_class: string | null;
  created_at: string;
  played_at: string | null;
  chess_game_id: string | null;
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

// Best/worst/most-errors game, scoped to the analyzed games within the last-1000
// window (consistent with the rest of the dashboard).
export const getHighlightGames = cache(async function(userId: string, timeClass?: string): Promise<HighlightGames> {
  const windowRows = await getGameWindow(userId, timeClass);
  const games = windowRows.filter((g) => g.accuracy !== null);

  if (games.length === 0) return { best: null, worst: null, mostErrors: null };

  const ids = games.map((g) => g.id);

  const moveRows = await getMovesOfGames<{ game_id: string; ply?: number | null }>(
    ids,
    (await hasPlyColumn()) ? "game_id, ply" : "game_id",
    { classes: ["blunder", "mistake"] },
  );

  // Only the player's own errors: the table also holds the rival's moves.
  const side = new Map(games.map((g) => [g.id, g.played_as]));
  const errorCount = new Map<string, number>();
  for (const row of moveRows) {
    if (!isOwnRow(row, side.get(row.game_id) ?? "white")) continue;
    errorCount.set(row.game_id, (errorCount.get(row.game_id) ?? 0) + 1);
  }

  function toHighlight(g: GameWindowRow): HighlightGame {
    return {
      id: g.id,
      opening: g.opening ?? "Apertura Desconocida",
      result: g.result,
      accuracy: g.accuracy,
      errorCount: errorCount.get(g.id) ?? 0,
      played_as: g.played_as,
    };
  }

  // Best = your highest-accuracy WIN (a "best game" shouldn't be a loss).
  const winsAcc = games.filter((g) => g.result === "win");
  const best = winsAcc.length > 0
    ? toHighlight(winsAcc.reduce((a, b) => (b.accuracy! > a.accuracy! ? b : a)))
    : toHighlight(games.reduce((a, b) => (b.accuracy! > a.accuracy! ? b : a)));

  // Worst = your lowest-accuracy LOSS. Fall back to worst-accuracy overall.
  const lossesAcc = games.filter((g) => g.result === "loss");
  const worst = lossesAcc.length > 0
    ? toHighlight(lossesAcc.reduce((a, b) => (b.accuracy! < a.accuracy! ? b : a)))
    : toHighlight(games.reduce((a, b) => (b.accuracy! < a.accuracy! ? b : a)));

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

// Scoped to the last-1000 window — Aperturas showed the same "fetch everything"
// slowness as the dashboard on large accounts.
export async function getOpeningsByColor(
  userId: string,
  color: "white" | "black" | "both"
): Promise<OpeningWithGames[]> {
  const rows = await getGameWindow(userId);
  const filtered = color === "both" ? rows : rows.filter((g) => g.played_as === color);
  if (filtered.length === 0) return [];

  const map = new Map<string, { wins: number; losses: number; draws: number }>();
  for (const g of filtered) {
    if (!g.opening) continue;
    if (!map.has(g.opening)) map.set(g.opening, { wins: 0, losses: 0, draws: 0 });
    const s = map.get(g.opening)!;
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
  const base = "id, opening, result, accuracy, played_as, white_rating, black_rating, time_control, created_at, chess_game_id";
  const { data } = await supabase
    .from("games")
    .select(modern ? `${base}, time_class, played_at` : base)
    .eq("user_id", userId)
    .eq("opening", openingName)
    .order(modern ? "played_at" : "created_at", { ascending: false, nullsFirst: true });
  return (data ?? []) as unknown as RecentGame[];
}

// Returns IDs of the user's games that have no analyzed moves yet (most recent first).
export async function getUnanalyzedGameIds(userId: string, limit = 50): Promise<string[]> {
  const { data: games } = await supabase
    .from("games")
    .select("id")
    .eq("user_id", userId)
    .order(await gameOrderCol(), { ascending: false, nullsFirst: true })
    .limit(limit);

  if (!games || games.length === 0) return [];
  const allIds = games.map((g) => g.id);

  // Every analysed game has a row for its first move: asking for just those keeps the answer
  // to a couple of rows per game instead of every move of every game.
  const analyzedRows = await getMovesOfGames<{ game_id: string }>(allIds, "game_id", { moveNumber: 1 });

  const analyzed = new Set(analyzedRows.map((r) => r.game_id));
  return allIds.filter((id) => !analyzed.has(id));
}

/**
 * The user's most recent game ids, analysed or not. Used to REGENERATE the analysis of games
 * that already have comments: the comment engine improves, and games analysed before the
 * improvement keep the old text until they are analysed again.
 */
export async function getAllGameIds(userId: string, limit = 200): Promise<string[]> {
  const { data: games } = await supabase
    .from("games")
    .select("id")
    .eq("user_id", userId)
    .order(await gameOrderCol(), { ascending: false, nullsFirst: true })
    .limit(limit);
  return (games ?? []).map((g) => g.id);
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
  const rows = await getGameWindow(userId, timeClass);
  if (rows.length === 0) {
    return { wins: 0, losses: 0, draws: 0, winrate: 0, excluded: 0, counted: 0 };
  }

  let wins = rows.filter((g) => g.result === "win").length;
  let losses = rows.filter((g) => g.result === "loss").length;
  const draws = rows.filter((g) => g.result === "draw").length;
  let excluded = 0;

  const modern = await hasModernSchema();
  // Only ANALYZED abandonment games (win/loss) can be excluded — a tiny, bounded set.
  const abGames = modern
    ? rows.filter((g) => g.ended_by_abandonment && (g.result === "win" || g.result === "loss") && g.accuracy !== null)
    : [];

  if (abGames.length > 0) {
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

// Returns the player's ELO across their last-1000 games, oldest → newest.
export const getEloHistory = cache(async function(userId: string, timeClass?: string, limit = DASHBOARD_WINDOW): Promise<EloPoint[]> {
  const rows = await getGameWindow(userId, timeClass, limit);
  if (rows.length === 0) return [];

  return rows
    .slice()
    .reverse()
    .map((g, i) => {
      const isWhite = g.played_as === "white";
      const elo = isWhite ? g.white_rating : g.black_rating;
      const opponentElo = isWhite ? g.black_rating : g.white_rating;
      return { index: i + 1, date: g.played_at ?? g.created_at, elo, opponentElo };
    })
    .filter((p) => typeof p.elo === "number" && p.elo > 0);
});

export async function getRecentGames(userId: string, limit = 20, timeClass?: string): Promise<RecentGame[]> {
  const rows = await getGameWindow(userId, timeClass, limit, true);
  return rows.map((g) => ({
    id: g.id,
    opening: g.opening ?? "Desconocida",
    result: g.result,
    accuracy: g.accuracy,
    played_as: g.played_as,
    white_rating: g.white_rating,
    black_rating: g.black_rating,
    time_control: g.time_control,
    time_class: g.time_class,
    created_at: g.created_at,
    played_at: g.played_at,
    chess_game_id: g.chess_game_id,
  }));
}
