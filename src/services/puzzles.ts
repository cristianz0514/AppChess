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
  const res = await fetch(`https://lichess.org/api/puzzle/next?angle=${angle}`, { headers: LICHESS_HEADERS });
  if (!res.ok) return null;
  const data = (await res.json()) as LichessPuzzleResponse;

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

// Seeds a FIXED, numbered batch of Lichess puzzles for a mate-in-N level —
// this gives the road trip stable, replayable content instead of depending on
// the live API during play. Safe to re-run: skips puzzle ids already stored,
// and only adds enough new ones to reach `count` total for that level.
export async function seedLichessPuzzles(mateIn: 1 | 2, count: number): Promise<{ added: number; total: number }> {
  const angle = mateIn === 1 ? "mateIn1" : "mateIn2";

  const { count: existing } = await supabase
    .from("puzzles")
    .select("id", { count: "exact", head: true })
    .eq("source", "lichess")
    .eq("mate_in", mateIn);

  let have = existing ?? 0;
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
  // Cap attempts so a run of duplicates/failures can't loop forever.
  const MAX_ATTEMPTS = (count - have) * 4 + 20;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && have < count; attempt++) {
    const p = await fetchOneLichessPuzzle(angle);
    if (!p || seen.has(p.externalId)) continue;
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
    // Unique(source, external_id) may already have this one from a prior run — skip, don't fail the batch.
    if (!error) { nextOrder++; have++; added++; }
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

      const { count: orderBase } = await supabase
        .from("puzzles")
        .select("id", { count: "exact", head: true })
        .eq("mate_in", mateN as 1 | 2);

      const { error } = await supabase.from("puzzles").insert({
        source: "user_game",
        user_id: userId,
        game_id: g.id,
        fen: fenBefore,
        solution: solutionMoves,
        mate_in: mateN,
        order_index: (orderBase ?? 0) + 1000, // personalized puzzles slot in after the seeded batch
      });
      if (!error) added++;
      break; // one personalized puzzle per game is plenty
    }
  }

  return { added };
}
