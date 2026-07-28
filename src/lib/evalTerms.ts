// Evaluation terms — the eval broken into its parts.
//
// Stockfish gives one number. One number can only ever produce "quedas peor",
// which is the wildcard we keep trying to kill. A real engine's eval is a SUM
// of named terms, and the term that moved is the reason the position changed.
// Recomputing those terms ourselves — cheaply, from the attack map — lets the
// coach say WHICH part of the position got worse.
//
// These are not Stockfish's weights and don't need to be: they aren't used to
// pick moves, only to rank which aspect changed most so the comment names the
// right one. The engine's own number stays the source of truth for how bad it is.

import { buildAttackMap, piecesOf, kingRingPressure, PIECE_VALUE, type Color } from "./attackMap";

export interface EvalTerms {
  material: number;     // pawns
  mobility: number;     // squares your pieces can reach
  space: number;        // squares you control in the opponent's half
  kingSafety: number;   // negative = your king is under pressure
  development: number;  // minors off the back rank
}

export function evalTerms(fen: string, color: Color): EvalTerms {
  const map = buildAttackMap(fen);
  const mine = piecesOf(fen, color);
  const enemyHalf = color === "w" ? [5, 6, 7, 8] : [1, 2, 3, 4];

  let material = 0, development = 0;
  for (const p of mine) {
    material += PIECE_VALUE[p.type] ?? 0;
    if ((p.type === "n" || p.type === "b") && Number(p.square[1]) !== (color === "w" ? 1 : 8)) development++;
  }

  let mobility = 0, space = 0;
  const occupiedByMe = new Set(mine.map((p) => p.square));
  for (const [square, attackers] of map) {
    const count = attackers.filter((a) => a.color === color).length;
    if (count === 0) continue;
    if (!occupiedByMe.has(square)) mobility += count;
    if (enemyHalf.includes(Number(square[1]))) space += count;
  }

  return { material, mobility, space, kingSafety: -kingRingPressure(fen, color), development };
}

export type TermName = "material" | "mobility" | "space" | "kingSafety" | "development";

// Weights convert each term to a common scale so they can be compared. Material
// dominates on purpose: a term change only gets named when nothing material
// happened, because "pierdes la torre" always beats "pierdes movilidad".
const WEIGHT: Record<TermName, number> = {
  material: 1, mobility: 0.06, space: 0.05, kingSafety: 0.35, development: 0.25,
};

// Below this the change is noise — every move shifts mobility by a square or two.
const MIN_SIGNIFICANT = 0.55;

export interface TermChange {
  term: TermName;
  delta: number;        // raw units, signed from the mover's point of view
  weighted: number;
}

/**
 * Which single aspect of the position the move changed most. Returns null when
 * nothing moved enough to be worth a sentence — silence beats inventing a reason.
 */
export function dominantChange(
  fenBefore: string, fenAfter: string, color: Color,
): TermChange | null {
  const before = evalTerms(fenBefore, color);
  const after = evalTerms(fenAfter, color);

  let best: TermChange | null = null;
  for (const term of Object.keys(WEIGHT) as TermName[]) {
    const delta = after[term] - before[term];
    const weighted = delta * WEIGHT[term];
    if (Math.abs(weighted) < MIN_SIGNIFICANT) continue;
    if (!best || Math.abs(weighted) > Math.abs(best.weighted)) best = { term, delta, weighted };
  }
  return best;
}

/**
 * The same question about the OPPONENT: did this move expose their king, or
 * take away their squares? That's the positive half — "ganas espacio" is only
 * half the story if the other half is "y le quitas aire a su rey".
 */
export function pressureOnOpponent(
  fenBefore: string, fenAfter: string, color: Color,
): { theirKingWorse: boolean; theirMobilityDrop: number } {
  const enemy: Color = color === "w" ? "b" : "w";
  const before = evalTerms(fenBefore, enemy);
  const after = evalTerms(fenAfter, enemy);
  return {
    // The move has to ADD pressure and leave a real amount of it. Requiring two
    // new attackers missed the commonest case by one: a queen swinging over to
    // join a bishop already eyeing f7 adds a single attacker and is exactly the
    // move worth pointing out.
    theirKingWorse: after.kingSafety < before.kingSafety && after.kingSafety <= -2,
    theirMobilityDrop: before.mobility - after.mobility,
  };
}
