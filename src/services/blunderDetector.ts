import { Chess } from "chess.js";
import { evaluatePosition } from "./stockfish";
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

  const moves: Omit<Move, "id">[] = [];
  let prevScore: number | null = null;

  for (let i = 0; i < Math.min(history.length, 30); i++) {
    const move = history[i];
    chess.move(move.san);

    const fen = chess.fen();
    const isWhiteTurn = i % 2 === 0;

    try {
      const { score } = await evaluatePosition(fen, 10);
      const normalizedScore = isWhiteTurn ? -score : score;

      let centipawnLoss = 0;
      if (prevScore !== null) {
        centipawnLoss = Math.max(0, Math.round((prevScore - normalizedScore) * 100));
      }

      moves.push({
        game_id: gameId,
        move_number: Math.floor(i / 2) + 1,
        move: move.san,
        evaluation: normalizedScore,
        centipawn_loss: centipawnLoss,
        classification: classify(centipawnLoss),
      });

      prevScore = normalizedScore;
    } catch {
      moves.push({
        game_id: gameId,
        move_number: Math.floor(i / 2) + 1,
        move: move.san,
        evaluation: null,
        centipawn_loss: null,
        classification: null,
      });
    }
  }

  if (moves.length > 0) {
    await supabase.from("moves").upsert(
      moves.map((m) => ({ ...m })),
      { ignoreDuplicates: false }
    );

    const blunders = moves.filter((m) => m.classification === "blunder").length;
    const mistakes = moves.filter((m) => m.classification === "mistake").length;
    const inaccuracies = moves.filter((m) => m.classification === "inaccuracy").length;
    const total = moves.filter((m) => m.centipawn_loss !== null).length;

    const accuracy =
      total > 0
        ? Math.max(
            0,
            Math.round(
              (1 -
                (blunders * 3 + mistakes * 2 + inaccuracies) /
                  (total * 3)) *
                100 *
                10
            ) / 10
          )
        : null;

    await supabase
      .from("games")
      .update({ accuracy })
      .eq("id", gameId);
  }
}
