import { Chess } from "chess.js";
import { analyzeAllFens } from "./stockfish";
import { supabase } from "@/lib/supabase";
import type { Move } from "@/types";

export type MoveClassification = Move["classification"];

function classify(centipawnLoss: number): MoveClassification {
  if (centipawnLoss < 10) return "best";
  if (centipawnLoss < 25) return "excellent";
  if (centipawnLoss < 50) return "good";
  if (centipawnLoss < 100) return "inaccuracy";
  if (centipawnLoss < 200) return "mistake";
  return "blunder";
}

export async function analyzeGame(gameId: string, pgn: string): Promise<void> {
  const chess = new Chess();

  try {
    chess.loadPgn(pgn);
  } catch {
    return;
  }

  const history = chess.history({ verbose: true });
  chess.reset();

  // Build FEN list for every position after each move
  const fens: string[] = [];
  for (const move of history) {
    chess.move(move.san);
    fens.push(chess.fen());
  }

  // Analyze ALL positions with a single Stockfish process
  const evals = await analyzeAllFens(fens, 6);

  // Stockfish reports `score cp` from the SIDE-TO-MOVE perspective (UCI standard).
  // After move i (0-indexed), the side to move is white when i is odd.
  // Convert every raw score to WHITE's perspective (positive = white better) so the
  // stored `evaluation` is consistent and the eval bar reads it directly.
  const whiteEval: (number | null)[] = evals.map((r, i) => {
    if (!r) return null;
    const whiteToMove = i % 2 === 1; // after an even-index move, black is to move
    return whiteToMove ? r.score : -r.score;
  });

  const moves: Omit<Move, "id">[] = [];

  for (let i = 0; i < history.length; i++) {
    const move = history[i];
    const cur = whiteEval[i];

    if (cur === null) {
      moves.push({
        game_id: gameId,
        move_number: Math.floor(i / 2) + 1,
        move: move.san,
        evaluation: null,
        centipawn_loss: null,
        classification: null,
      });
      continue;
    }

    // Eval before this move, in white's perspective (0 ≈ equal for the very first move).
    const prev = i === 0 ? 0 : whiteEval[i - 1];
    const whiteJustMoved = i % 2 === 0;

    let centipawnLoss = 0;
    if (prev !== null) {
      // Loss is measured from the moving player's perspective: white wants whiteEval
      // to rise, black wants it to fall. A drop in the mover's favour = a mistake.
      const drop = whiteJustMoved ? prev - cur : cur - prev;
      centipawnLoss = Math.min(2000, Math.max(0, Math.round(drop * 100)));
    }

    moves.push({
      game_id: gameId,
      move_number: Math.floor(i / 2) + 1,
      move: move.san,
      evaluation: cur,
      centipawn_loss: centipawnLoss,
      classification: classify(centipawnLoss),
    });
  }

  if (moves.length === 0) return;

  await supabase.from("moves").delete().eq("game_id", gameId);
  await supabase.from("moves").insert(moves.map((m) => ({ ...m })));

  const analyzed = moves.filter((m) => m.centipawn_loss !== null);
  const blunders    = analyzed.filter((m) => m.classification === "blunder").length;
  const mistakes    = analyzed.filter((m) => m.classification === "mistake").length;
  const inaccuracies = analyzed.filter((m) => m.classification === "inaccuracy").length;
  const total = analyzed.length;

  const accuracy =
    total > 0
      ? Math.max(
          0,
          Math.round(
            (1 - (blunders * 3 + mistakes * 2 + inaccuracies) / (total * 3)) * 100 * 10
          ) / 10
        )
      : null;

  await supabase.from("games").update({ accuracy }).eq("id", gameId);
}
