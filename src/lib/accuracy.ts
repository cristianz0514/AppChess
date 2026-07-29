// Accuracy, computed the way the big sites compute it.
//
// The formula this replaces was a made-up weighted count of mistakes:
//
//   1 - (blunders*3 + mistakes*2 + inaccuracies) / (total*3)
//
// Two things were wrong with it. It counted BOTH players' moves, so the
// opponent's blunders dragged the player's accuracy down — a straightforward
// bug, not a modelling choice. And centipawns are not linear in importance: 100
// centipawns thrown away from a dead-equal position changes the game, while the
// same 100 thrown away from +9 changes nothing. Counting mistakes by band treats
// those identically.
//
// The fix is the standard approach: convert the evaluation to a WIN PROBABILITY
// first, then measure how much of it a move gave away. Losing 10% of your winning
// chances is the same size of error wherever it happens, which is what makes the
// number comparable across positions and across games.

/**
 * Win probability (0-100) for the side to move, from an evaluation in centipawns.
 * The logistic constant is the one Lichess fitted against its own game database.
 */
export function winPercent(centipawns: number): number {
  const cp = Math.max(-1000, Math.min(1000, centipawns));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/**
 * Accuracy (0-100) for a single move, from the win probability before and after.
 * Both must be from the SAME side's perspective — the mover's.
 *
 * The exponential means small slips barely register while a real error falls off
 * a cliff, which is what makes the result read like a grade instead of a
 * percentage of moves.
 */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const lost = Math.max(0, winBefore - winAfter);
  const raw = 103.1668 * Math.exp(-0.04354 * lost) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Game accuracy from the per-move accuracies of ONE player.
 *
 * The mean of the arithmetic and harmonic means, which is what Lichess uses: the
 * harmonic mean punishes a single catastrophic move properly (one 0% move can't
 * be averaged away by thirty 100% moves), while the arithmetic mean keeps the
 * number from collapsing entirely over one slip. Averaging the two lands where a
 * human would grade the game.
 */
export function gameAccuracy(moveAccuracies: number[]): number | null {
  if (moveAccuracies.length === 0) return null;
  const arithmetic = moveAccuracies.reduce((s, a) => s + a, 0) / moveAccuracies.length;
  // +1 keeps a 0% move from making the harmonic mean zero on its own.
  const harmonic = moveAccuracies.length /
    moveAccuracies.reduce((s, a) => s + 1 / (a + 1), 0) - 1;
  return Math.round(((arithmetic + Math.max(0, harmonic)) / 2) * 10) / 10;
}

/** Average centipawn loss over a player's moves — the classic strength measure. */
export function averageCentipawnLoss(losses: number[]): number | null {
  if (losses.length === 0) return null;
  // Capped per move: one 2000-centipawn collapse otherwise dominates the average
  // and says more about that single move than about how the player plays.
  const capped = losses.map((l) => Math.min(300, Math.max(0, l)));
  return Math.round(capped.reduce((s, l) => s + l, 0) / capped.length);
}

// NOTE: there is deliberately no rating estimator here. lib/eloEstimate.ts already
// owns that curve, and it does it better — it excludes opening-book moves from
// the ACPL, which this file has no way to know about. A second implementation
// would just drift away from the first.

export interface SideAccuracy {
  accuracy: number | null;
  acpl: number | null;
  moves: number;
}

/**
 * Accuracy for one side of a game.
 *
 * `evals` are white-perspective evaluations in PAWNS after each ply, `plies` the
 * indices belonging to this side, and `losses` the stored centipawn losses.
 */
export function sideAccuracy(
  whiteEvalsPawns: (number | null)[],
  losses: (number | null)[],
  side: "white" | "black",
): SideAccuracy {
  const accuracies: number[] = [];
  const cpLosses: number[] = [];

  for (let ply = 0; ply < whiteEvalsPawns.length; ply++) {
    const isWhiteMove = ply % 2 === 0;
    if ((side === "white") !== isWhiteMove) continue;

    const after = whiteEvalsPawns[ply];
    const before = ply === 0 ? 0 : whiteEvalsPawns[ply - 1];
    if (after == null || before == null) continue;

    // Mate scores would saturate the logistic and make every move around a mate
    // look identical; clamping keeps them at the edge without distorting.
    const sign = side === "white" ? 1 : -1;
    const wBefore = winPercent(sign * before * 100);
    const wAfter = winPercent(sign * after * 100);
    accuracies.push(moveAccuracy(wBefore, wAfter));

    const l = losses[ply];
    if (l != null) cpLosses.push(l);
  }

  return {
    accuracy: gameAccuracy(accuracies),
    acpl: averageCentipawnLoss(cpLosses),
    moves: accuracies.length,
  };
}
