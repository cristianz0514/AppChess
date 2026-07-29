// Runs a full game analysis in the browser.
//
// The replacement for POST /api/analyze. It does exactly what the route did —
// fetch the PGN, run analyzeGame, write the rows — except the engine and the
// CPU belong to whoever is looking at the page.
//
// Two things made this a small change rather than a rewrite:
//   • every analysis module is pure chess.js and TypeScript, with no Node
//     dependency, so the detectors and templates came across untouched
//   • Supabase is already anon-key only (NEXT_PUBLIC_*), so the browser could
//     always write these rows; nothing was gated behind a server secret
//
// There is no busy/queue state any more. The one-at-a-time lock existed because
// a single server process owned a single engine; here each tab owns its own.

"use client";

import { supabase } from "./supabase";
import { browserEngine, warmUpEngine, activeEngineBuild } from "./browserEngine";
import { analyzeGame } from "@/services/blunderDetector";

export interface AnalysisProgress {
  done: number;
  total: number;
  label: string;
}

export class AnalysisError extends Error {}

/**
 * Analyzes one game and writes the moves. `force` re-analyzes a game that
 * already has rows (used to regenerate coach comments after a template change).
 *
 * Progress is reported per position so the bar moves; because analyzeGame writes
 * each comment as it goes, a closed tab loses only the remaining moves, and
 * re-running picks up from a complete set rather than starting from nothing.
 */
export async function analyzeGameInBrowser(
  gameId: string,
  opts: { force?: boolean; onProgress?: (p: AnalysisProgress) => void } = {},
): Promise<void> {
  const { force = false, onProgress } = opts;

  if (!force) {
    const { count } = await supabase
      .from("moves")
      .select("id", { count: "exact", head: true })
      .eq("game_id", gameId);
    if (count && count > 0) return;   // already analysed, nothing to do
  }

  onProgress?.({ done: 0, total: 0, label: "Cargando el motor de ajedrez…" });
  // Surfaced separately because it's the one genuinely slow step on a cold
  // cache — and with the full 108MB net in play it can be a long one, so the
  // label names the size once it's known rather than leaving a bar at zero.
  await warmUpEngine();
  const build = activeEngineBuild();
  if (build) {
    onProgress?.({
      done: 0, total: 0,
      label: `Motor ${build.label} (${build.megabytes} MB${build.threads > 1 ? `, ${build.threads} hilos` : ""}) listo`,
    });
  }

  const { data: game, error } = await supabase
    .from("games")
    .select("id, pgn")
    .eq("id", gameId)
    .single();

  if (error || !game?.pgn) throw new AnalysisError("No se encontró la partida");

  await analyzeGame(game.id, game.pgn, browserEngine, (done, total, label) => {
    onProgress?.({ done, total, label: label ?? "Analizando…" });
  });
}

/**
 * Analyzes every unanalysed game for a user, one after another.
 *
 * Sequential on purpose: there's one engine per tab, and running two analyses
 * concurrently would just split the same CPU while making the progress
 * meaningless. This replaces the server-side queue, which existed to stop
 * concurrent users from colliding on the shared engine — a problem that no
 * longer exists.
 */
export async function analyzePendingInBrowser(
  gameIds: string[],
  opts: {
    onProgress?: (gameIndex: number, totalGames: number, p: AnalysisProgress) => void;
    // Checked between games rather than mid-game: stopping halfway through a
    // game would leave it with a partial set of moves, which reads as a broken
    // analysis rather than an unfinished one.
    shouldStop?: () => boolean;
  } = {},
): Promise<{ analyzed: number; failed: number; stopped: boolean }> {
  const { onProgress, shouldStop } = opts;
  let analyzed = 0, failed = 0;
  for (let i = 0; i < gameIds.length; i++) {
    if (shouldStop?.()) return { analyzed, failed, stopped: true };
    try {
      await analyzeGameInBrowser(gameIds[i], {
        onProgress: (p) => onProgress?.(i, gameIds.length, p),
      });
      analyzed++;
    } catch {
      // One unparseable PGN must not stop the batch.
      failed++;
    }
  }
  return { analyzed, failed, stopped: false };
}
