// The rule of the square — can the defending king catch the passed pawn?
//
// This is the single most decisive question in a king-and-pawn ending, and it
// has an exact answer from geometry alone: draw a square whose side is the
// pawn's distance to promotion; if the defending king stands inside it, the pawn
// is caught, and if it doesn't, the pawn promotes. No engine, no search.
//
// It's also the highest-value thing the coach can say in an endgame, because a
// club player who gets this wrong loses a game that was winning — and unlike
// most advice, the answer is binary and provable rather than a matter of degree.
//
// Deliberately narrow: it only speaks up in genuine king-and-pawn endings. With
// any piece left on the board the geometry stops being decisive (a rook can stop
// the pawn from outside the square, a bishop can block it), and a confident
// wrong answer is worse than silence.

import { piecesOf, type Color } from "./attackMap";

export interface SquareRuleVerdict {
  pawnSquare: string;
  promotes: boolean;   // true = the pawn gets through, false = the king catches it
  margin: number;      // tempi to spare (positive) or short (negative)
}

const fileIdx = (s: string) => s.charCodeAt(0) - 97;
const rankOf = (s: string) => Number(s[1]);

/**
 * Verdict on the most advanced passed pawn of `side`, or null when the position
 * isn't a pure king-and-pawn ending or there's no passed pawn to judge.
 *
 * `sideToMove` matters by exactly one tempo, which is often the whole game.
 */
export function ruleOfTheSquare(
  fen: string, side: Color, sideToMove: Color, passedPawns: string[],
): SquareRuleVerdict | null {
  const all = piecesOf(fen);
  // Kings and pawns only.
  if (all.some((p) => p.type !== "k" && p.type !== "p")) return null;

  const enemy: Color = side === "w" ? "b" : "w";
  const theirKing = all.find((p) => p.type === "k" && p.color === enemy);
  if (!theirKing) return null;

  const mine = passedPawns.filter((sq) => all.some((p) => p.square === sq && p.color === side && p.type === "p"));
  if (mine.length === 0) return null;

  // Judge the pawn closest to promoting — the one that decides the game.
  const advanced = mine.sort((a, b) =>
    side === "w" ? rankOf(b) - rankOf(a) : rankOf(a) - rankOf(b))[0];

  const promoRank = side === "w" ? 8 : 1;
  const promoSquare = `${advanced[0]}${promoRank}`;
  let steps = Math.abs(promoRank - rankOf(advanced));
  // A pawn still on its starting rank moves two squares first, so it needs one
  // fewer move than the rank difference suggests. Forgetting this is the classic
  // way to miscount the square by a tempo.
  if (rankOf(advanced) === (side === "w" ? 2 : 7)) steps -= 1;

  const kingSteps = Math.max(
    Math.abs(fileIdx(theirKing.square) - fileIdx(promoSquare)),
    Math.abs(rankOf(theirKing.square) - promoRank),
  );

  // The defender needs to reach the promotion square in no more moves than the
  // pawn needs; moving second costs a tempo.
  const effective = sideToMove === side ? kingSteps : kingSteps - 1;
  return { pawnSquare: advanced, promotes: effective > steps, margin: effective - steps };
}

/**
 * What KIND of endgame this is. Naming it is the most instructive single sentence
 * available in an endgame and it costs one board read — a club player who is told
 * "esto es un final de torres" has a whole body of knowledge to reach for, while
 * "jugada de final tranquila" gives them nothing.
 *
 * Returns null outside an endgame, so the caller doesn't have to gate twice.
 */
export function endgameKind(fen: string): string | null {
  const all = piecesOf(fen);
  const heavy = all.filter((p) => p.type !== "p" && p.type !== "k");
  if (heavy.length > 4) return null;

  const kinds = new Set(heavy.map((p) => p.type));
  if (heavy.length === 0) return "final de reyes y peones";
  if (kinds.size === 1) {
    const only = [...kinds][0];
    if (only === "r") return "final de torres";
    if (only === "q") return "final de damas";
    if (only === "n") return "final de caballos";
    if (only === "b") {
      // Same-colour vs opposite-colour bishops is THE question in a bishop
      // ending — opposite colours draw material deficits that same colours win.
      const bishops = heavy.filter((p) => p.type === "b");
      if (bishops.length === 2 && bishops[0].color !== bishops[1].color) {
        const sqColor = (s: string) => (fileIdx(s) + rankOf(s)) % 2;
        return sqColor(bishops[0].square) === sqColor(bishops[1].square)
          ? "final de alfiles del mismo color"
          : "final de alfiles de distinto color";
      }
      return "final de alfiles";
    }
  }
  if (kinds.size === 2 && kinds.has("b") && kinds.has("n")) return "final de alfil contra caballo";
  return "final con pocas piezas";
}

/**
 * A pawn majority on one wing: more pawns than the opponent on the queenside or
 * the kingside. This is the plan a club player most often has and never sees —
 * a majority is a future passed pawn, which is what decides most endgames.
 *
 * Only reported when the OTHER wing isn't also a majority for the same side
 * (that's just being a pawn up, which material already covers).
 */
export function pawnMajority(fen: string, side: Color): "dama" | "rey" | null {
  const pawns = piecesOf(fen).filter((p) => p.type === "p");
  const wing = (s: string) => (fileIdx(s) <= 3 ? "dama" : "rey");
  let mineQ = 0, mineK = 0, theirsQ = 0, theirsK = 0;
  for (const p of pawns) {
    const w = wing(p.square);
    if (p.color === side) { if (w === "dama") mineQ++; else mineK++; }
    else { if (w === "dama") theirsQ++; else theirsK++; }
  }
  const q = mineQ > theirsQ, k = mineK > theirsK;
  if (q === k) return null;          // both or neither: not a wing majority
  return q ? "dama" : "rey";
}
