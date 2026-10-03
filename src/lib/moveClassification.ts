import type { Move } from "@/types";

export type MoveClassification = Move["classification"];

/**
 * Classification from how much WIN PROBABILITY the move gave away, not from raw
 * centipawns (see lib/accuracy.ts for why: 100 centipawns thrown away from a
 * dead-equal position changes the game, from +9 it changes nothing).
 *
 * Thresholds were calibrated against real cases, which the tests in
 * moveClassification.test.ts keep pinned:
 *
 *   +11.6 -> +8.9   1.2%   excellent   (was wrongly "blunder" on raw centipawns)
 *   0.0   -> -0.1   0.9%   best
 *   0.0   -> -0.5   4.6%   inaccuracy
 *   +0.2  -> -2.0  19.5%   blunder
 *   +3.0  -> +0.2  23.3%   blunder
 *   +0.5  -> -3.2  31.1%   blunder
 */
export function classifyWinLoss(winLostPercent: number): MoveClassification {
  if (winLostPercent < 1) return "best";
  if (winLostPercent < 2) return "excellent";
  if (winLostPercent < 4) return "good";
  if (winLostPercent < 8) return "inaccuracy";
  if (winLostPercent < 18) return "mistake";
  return "blunder";
}

/**
 * Whether a move the engine already rates "best" is a real sacrifice, i.e.
 * deserves "brilliant".
 *
 * A sacrifice means the mover ends the exchange DOWN material: the moved piece is
 * worth at least a minor piece, it captures something worth strictly less than
 * itself (or nothing), and the opponent can take it back with something cheaper.
 *
 * The `capturedValue < movedValue` check is the important one. Without it a plain
 * even trade — bishop takes knight, pawn recaptures — passed, because the
 * recapturing pawn is cheaper than the bishop even though the bishop just won a
 * knight. That was the reported "brilliant is too easy" bug.
 *
 * `recapturerValues` are the values of the opponent pieces able to capture on the
 * destination square right after the move (empty = nothing can take it).
 */
export function isBrilliantSacrifice(args: {
  movedValue: number;
  capturedValue: number;
  evalBefore: number;
  recapturerValues: number[];
}): boolean {
  const { movedValue, capturedValue, evalBefore, recapturerValues } = args;
  if (movedValue < 3 || capturedValue >= movedValue) return false;
  if (evalBefore > 4.5) return false; // already crushing: giving a piece back isn't brilliant
  if (recapturerValues.length === 0) return false;
  return Math.min(...recapturerValues) < movedValue;
}
