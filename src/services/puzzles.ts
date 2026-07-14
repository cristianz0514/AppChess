import { Chess } from "chess.js";
import { supabase } from "@/lib/supabase";
import { getTopLines } from "./stockfish";

const LICHESS_HEADERS = { Accept: "application/json" };

interface LichessPuzzleResponse {
  game: { pgn: string };
  puzzle: { id: string; rating: number; solution: string[]; themes: string[]; initialPly: number };
}

// Fetches ONE live puzzle from Lichess's public puzzle API (CC0-licensed data,
// no auth needed) and converts it into our storage shape: a FEN for the
// position the PLAYER must solve from, plus their own solution moves in UCI.
async function fetchOneLichessPuzzle(angle: "mateIn1" | "mateIn2"): Promise<{
  externalId: string; fen: string; solution: string[]; rating: number;
} | null> {
  // No timeout here would let a single stalled connection to Lichess hang the
  // whole seeding request forever (observed live: works from a normal network,
  // hangs indefinitely on Render's) — bound every attempt so a bad connection
  // just counts as one failed attempt instead of freezing the endpoint.
  let data: LichessPuzzleResponse;
  try {
    const res = await fetch(`https://lichess.org/api/puzzle/next?angle=${angle}`, {
      headers: LICHESS_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    data = (await res.json()) as LichessPuzzleResponse;
  } catch {
    return null;
  }

  // Replay the game's PGN up to initialPly to get the FEN of the puzzle position.
  const chess = new Chess();
  try {
    chess.loadPgn(data.game.pgn);
  } catch {
    return null;
  }
  const history = chess.history({ verbose: true });
  // Lichess's `initialPly` points to the position BEFORE the opponent's setup
  // move (matching their CSV convention: "FEN is the position before opponent's
  // move"). The solver's actual turn starts one ply later — verified empirically
  // against several live puzzles (solution[0] is only legal at ply+1).
  const solverPly = data.puzzle.initialPly + 1;
  if (solverPly > history.length) return null;

  const replay = new Chess();
  for (let i = 0; i < solverPly; i++) replay.move(history[i].san);

  return {
    externalId: data.puzzle.id,
    fen: replay.fen(),
    solution: data.puzzle.solution,
    rating: data.puzzle.rating,
  };
}

// Thrown when the `puzzles` table doesn't exist yet (migration not run) — lets
// callers fail FAST with a clear, actionable message instead of grinding
// through dozens of live Lichess calls that can never succeed.
export class PuzzlesSchemaMissingError extends Error {
  constructor() { super("La tabla 'puzzles' no existe todavía en la base de datos. Corre la migración 005 en Supabase."); }
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST205" || /could not find the table/i.test(error.message ?? "");
}

// Seeds a batch of Lichess puzzles for a mate-in-N level, up to `count` total
// stored for that level — this gives the road trip stable, replayable content
// instead of depending on the live API during play. Safe to re-run: skips
// puzzle ids already stored, only adds as many NEW ones as needed.
//
// Designed to be called with a SMALL `count` for a fast initial batch (a few
// seconds, unblocks the player quickly) and again with a larger target to top
// up in the background while they play — see BackgroundSeeder on the client.
export async function seedLichessPuzzles(mateIn: 1 | 2, count: number): Promise<{ added: number; total: number }> {
  const angle = mateIn === 1 ? "mateIn1" : "mateIn2";

  const existingQ = await supabase
    .from("puzzles")
    .select("id", { count: "exact", head: true })
    .eq("source", "lichess")
    .eq("mate_in", mateIn);
  if (isMissingTableError(existingQ.error)) throw new PuzzlesSchemaMissingError();

  let have = existingQ.count ?? 0;
  if (have >= count) return { added: 0, total: have };

  const { data: maxRow } = await supabase
    .from("puzzles")
    .select("order_index")
    .eq("source", "lichess")
    .eq("mate_in", mateIn)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextOrder = (maxRow?.order_index ?? -1) + 1;

  const seen = new Set<string>();
  let added = 0;
  let consecutiveErrors = 0;
  // Cap attempts so a run of duplicates/failures can't loop forever, but abort
  // MUCH earlier (after a handful of consecutive failures) — a persistent DB
  // error won't fix itself by retrying 50 more times against Lichess.
  const MAX_ATTEMPTS = (count - have) * 3 + 10;
  const MAX_CONSECUTIVE_ERRORS = 4;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && have < count; attempt++) {
    const p = await fetchOneLichessPuzzle(angle);
    if (!p) {
      // A network failure/timeout reaching Lichess itself — not a duplicate.
      // Count it toward the same fail-fast budget as insert errors so a
      // persistently unreachable Lichess doesn't grind through MAX_ATTEMPTS
      // at up to 8s per try.
      consecutiveErrors++;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) break;
      continue;
    }
    if (seen.has(p.externalId)) continue;
    seen.add(p.externalId);

    const { error } = await supabase.from("puzzles").insert({
      source: "lichess",
      external_id: p.externalId,
      fen: p.fen,
      solution: p.solution,
      mate_in: mateIn,
      rating: p.rating,
      order_index: nextOrder,
    });
    if (isMissingTableError(error)) throw new PuzzlesSchemaMissingError();
    if (!error) {
      nextOrder++; have++; added++; consecutiveErrors = 0;
    } else {
      // Unique(source, external_id) may already have this one from a prior run
      // — that's expected/harmless. Anything else repeating means a real
      // problem (bad connection, RLS, etc.) — don't grind forever on it.
      consecutiveErrors++;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) break;
    }
    // Be gentle with Lichess's anonymous rate limit.
    await new Promise((r) => setTimeout(r, 250));
  }

  return { added, total: have };
}

// Scans a player's most-recent ANALYZED games for positions where THEY had a
// real forced mate available (verified with the engine's exact "mate" score —
// not the shallow heuristic sweep), regardless of what they actually played.
// These become personalized puzzles in the road trip.
//
// CPU budget matters here (free-tier, 0.5 shared CPU): scanning every ply of
// every game would be thousands of engine calls. We bound BOTH how many games
// (small batch — this fires on every visit while under the target, so it
// converges over a few visits) AND how many plies per game (only the last 20 —
// forced mates in casual/blitz games overwhelmingly land in the late middlegame
// or endgame), and stop early once we've added a handful this run.
const MINE_MAX_GAMES = 8;
const MINE_MAX_PLIES_PER_GAME = 20;
const MINE_STOP_AFTER_ADDED = 5;

export async function minePlayerMates(userId: string, maxGames = MINE_MAX_GAMES): Promise<{ added: number }> {
  // Fail fast if the schema isn't ready — otherwise this would burn real engine
  // CPU (up to ~160 depth-10 calls) scanning games for a table that can never
  // accept the resulting insert anyway.
  const probe = await supabase.from("puzzles").select("id", { head: true }).limit(1);
  if (isMissingTableError(probe.error)) throw new PuzzlesSchemaMissingError();

  const { data: games } = await supabase
    .from("games")
    .select("id, pgn, played_as")
    .eq("user_id", userId)
    .not("accuracy", "is", null)
    .order("played_at", { ascending: false, nullsFirst: true })
    .limit(maxGames);

  if (!games || games.length === 0) return { added: 0 };

  const { data: existingRows } = await supabase
    .from("puzzles")
    .select("game_id")
    .eq("source", "user_game")
    .eq("user_id", userId);
  const alreadyMined = new Set((existingRows ?? []).map((r) => r.game_id));

  // Precompute the order_index base ONCE per level (was a fresh COUNT query
  // per successful match, up to MINE_STOP_AFTER_ADDED round-trips per run) —
  // increment it locally in memory as we add puzzles within this same batch.
  const orderBase = new Map<1 | 2, number>();
  for (const mateIn of [1, 2] as const) {
    const { count } = await supabase.from("puzzles").select("id", { count: "exact", head: true }).eq("mate_in", mateIn);
    orderBase.set(mateIn, count ?? 0);
  }

  let added = 0;
  for (const g of games) {
    if (added >= MINE_STOP_AFTER_ADDED) break;
    if (alreadyMined.has(g.id)) continue;

    const master = new Chess();
    try { master.loadPgn(g.pgn); } catch { continue; }
    const history = master.history({ verbose: true });
    const playerColor = g.played_as === "white" ? "w" : "b";

    const fens: string[] = [];
    { const c = new Chess(); for (const m of history) { c.move(m.san); fens.push(c.fen()); } }

    const startPly = Math.max(0, history.length - MINE_MAX_PLIES_PER_GAME);
    for (let i = startPly; i < history.length; i++) {
      if (history[i].color !== playerColor) continue; // only mates the PLAYER could deliver
      const fenBefore = i === 0 ? new Chess().fen() : fens[i - 1];

      let lines: { mate: number | null; pv: string[] }[] = [];
      try { lines = await getTopLines(fenBefore, 10, 1); } catch { continue; }
      const mateN = lines[0]?.mate;
      if (mateN == null || mateN <= 0 || mateN > 2) continue; // only real mate-in-1/2, for the mover

      const pv = lines[0].pv;
      const solutionMoves = mateN === 1 ? pv.slice(0, 1) : pv.slice(0, 3);
      if (solutionMoves.length < mateN * 2 - 1) continue; // PV too short to confirm the full mate line

      const nextOrder = (orderBase.get(mateN as 1 | 2) ?? 0) + 1000; // personalized puzzles slot in after the seeded batch
      const { error } = await supabase.from("puzzles").insert({
        source: "user_game",
        user_id: userId,
        game_id: g.id,
        fen: fenBefore,
        solution: solutionMoves,
        mate_in: mateN,
        order_index: nextOrder,
      });
      if (!error) { added++; orderBase.set(mateN as 1 | 2, (orderBase.get(mateN as 1 | 2) ?? 0) + 1); }
      break; // one personalized puzzle per game is plenty
    }
  }

  return { added };
}
