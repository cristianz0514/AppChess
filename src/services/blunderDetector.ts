import { Chess } from "chess.js";
import { analyzeAllFens, evaluatePosition } from "./stockfish";
import { supabase } from "@/lib/supabase";
import type { Move } from "@/types";

export type MoveClassification = Move["classification"];

// Two-pass analysis:
//  Pass 1 — a fast shallow sweep over EVERY position to find where the errors are.
//  Pass 2 — a DEEP re-evaluation of only those few error positions (and the move
//           before), so the important moments get strong analysis without paying
//           the deep cost on all ~70 positions. Concentrates CPU where it matters.
const SHALLOW_DEPTH = 8;
const DEEP_DEPTH = 12;      // deep enough to be reliable, short enough not to freeze the free-tier CPU
const MAX_DEEP_MOVES = 6;   // cap how many error positions we deepen

function classify(centipawnLoss: number): MoveClassification {
  if (centipawnLoss < 10) return "best";
  if (centipawnLoss < 25) return "excellent";
  if (centipawnLoss < 50) return "good";
  if (centipawnLoss < 100) return "inaccuracy";
  if (centipawnLoss < 200) return "mistake";
  return "blunder";
}

// Converts a side-to-move score (pawns) at ply i to white's perspective.
const toWhite = (score: number, i: number) => (i % 2 === 1 ? score : -score);

export async function analyzeGame(
  gameId: string,
  pgn: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
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

  // ── Pass 1: shallow sweep over every position ──────────────────────────────
  const evals = await analyzeAllFens(fens, SHALLOW_DEPTH, onProgress);

  // Stockfish reports `score cp` from the SIDE-TO-MOVE perspective (UCI standard).
  // Convert to WHITE's perspective so the stored eval is consistent everywhere.
  const whiteEval: (number | null)[] = evals.map((r, i) => (r ? toWhite(r.score, i) : null));

  // Builds the moves array (loss + classification) from the current whiteEval.
  const buildMoves = (): Omit<Move, "id">[] =>
    history.map((move, i) => {
      const cur = whiteEval[i];
      if (cur === null) {
        return { game_id: gameId, move_number: Math.floor(i / 2) + 1, move: move.san, evaluation: null, centipawn_loss: null, classification: null };
      }
      const prev = i === 0 ? 0 : whiteEval[i - 1];
      const whiteJustMoved = i % 2 === 0;
      let centipawnLoss = 0;
      if (prev !== null) {
        const drop = whiteJustMoved ? prev - cur : cur - prev;
        centipawnLoss = Math.min(2000, Math.max(0, Math.round(drop * 100)));
      }
      return { game_id: gameId, move_number: Math.floor(i / 2) + 1, move: move.san, evaluation: cur, centipawn_loss: centipawnLoss, classification: classify(centipawnLoss) };
    });

  // ── Pass 2: deepen only the worst positions ────────────────────────────────
  const prelim = buildMoves();
  const errorIdx = prelim
    .map((m, i) => ({ i, loss: m.centipawn_loss ?? 0, cls: m.classification }))
    .filter((m) => m.cls === "blunder" || m.cls === "mistake")
    .sort((a, b) => b.loss - a.loss)
    .slice(0, MAX_DEEP_MOVES)
    .map((m) => m.i);

  // Re-evaluate each error position AND the one before it (the loss needs both).
  const deepIdx = new Set<number>();
  for (const i of errorIdx) { deepIdx.add(i); if (i > 0) deepIdx.add(i - 1); }

  for (const i of deepIdx) {
    try {
      const r = await evaluatePosition(fens[i], DEEP_DEPTH);
      whiteEval[i] = toWhite(r.score, i);
    } catch { /* keep the shallow value */ }
  }

  const moves = buildMoves();
  if (moves.length === 0) return;

  // ── Highlight brilliant / great moves (chess.com style) ────────────────────
  // Only upgrade moves that were already "best". A brilliant is a sound
  // sacrifice; a great is a strong best move that wins a clean piece.
  const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  for (let i = 0; i < history.length; i++) {
    if (moves[i].classification !== "best") continue;
    const h = history[i];
    const moverWhite = i % 2 === 0;
    const evalAfter = whiteEval[i] == null ? 0 : (moverWhite ? whiteEval[i]! : -whiteEval[i]!);
    const evalBefore = i === 0 ? 0 : (whiteEval[i - 1] == null ? 0 : (moverWhite ? whiteEval[i - 1]! : -whiteEval[i - 1]!));
    if (evalAfter < -0.5) continue;               // must stay sound
    if (Math.abs(evalAfter) >= 9000) continue;    // ignore forced-mate lines

    const movedVal = VAL[h.piece] ?? 0;
    // Sacrifice: a cheaper enemy piece can capture the piece we just moved,
    // yet the engine still rates this the best move → brilliant.
    let brilliant = false;
    if (movedVal >= 3 && evalBefore <= 4.5) {
      try {
        const c = new Chess(fens[i]);
        const caps = c.moves({ verbose: true }).filter((x) => x.to === h.to && x.captured);
        if (caps.length && Math.min(...caps.map((x) => VAL[x.piece] ?? 99)) < movedVal) brilliant = true;
      } catch { /* ignore */ }
    }
    if (brilliant) { moves[i].classification = "brilliant"; continue; }

    // Great: best move that wins a clean piece (not a mere recapture) with a strong swing.
    const wonPiece = h.captured != null && (VAL[h.captured] ?? 0) >= 3;
    const isRecapture = i > 0 && history[i - 1].captured != null && history[i - 1].to === h.to;
    if (wonPiece && !isRecapture && evalAfter - evalBefore >= 1.5) {
      moves[i].classification = "great";
    }
  }

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
