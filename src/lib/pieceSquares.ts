// Piece-square tables — is this piece on a good square FOR ITS TYPE?
//
// Mobility already tells us how many squares a piece reaches. It can't tell us
// that a knight on a1 is badly placed even when it has moves, or that a rook
// belongs on the 7th rather than the 3rd. PSTs encode that per-type positional
// knowledge as a plain number per square, which is how every engine has done it
// since the 1970s.
//
// What we use them for isn't scoring the position — the engine's number already
// does that. It's finding the piece the player has FORGOTTEN: the bishop still
// on c1 twenty moves in, the knight parked on the rim. That's a real coaching
// remark ("tu alfil de c1 sigue sin entrar en juego") that nothing else in the
// set can make, and it's the most common structural mistake below 1400.

import { buildAttackMap, piecesOf, type Color } from "./attackMap";

// Read as a board from White's 8th rank down to the 1st, so the tables look
// like a chessboard in the source. Values are centipawn-ish nudges, not material.
const T = (rows: number[][]) => rows.flat();

const KNIGHT = T([
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
]);

const BISHOP = T([
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
]);

const ROOK = T([
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 5, 5, 0, 0, 0],
]);

const QUEEN = T([
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
]);

const TABLES: Record<string, number[]> = { n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN };

/**
 * Table value for a piece on a square. Black reads the same tables mirrored —
 * a knight on b8 is as undeveloped as a knight on b1.
 */
export function squareValue(type: string, color: Color, square: string): number {
  const table = TABLES[type];
  if (!table) return 0;
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const row = color === "w" ? 8 - rank : rank - 1;
  return table[row * 8 + file] ?? 0;
}

export interface PassivePiece {
  type: string;
  square: string;
  stillHome: boolean;
  // WHY it's passive, because the two reasons need different sentences. Saying
  // "está encerrado y casi no tiene casillas" about a knight on h4 that has two
  // squares is simply false — its problem is the rim, not the walls.
  reason: "entombed" | "badSquare";
}

/**
 * The player's least useful piece: badly placed by its own table AND short of
 * squares. Both conditions are required on purpose — a knight on h4 with a
 * dozen squares isn't a problem, and a well-placed piece that's momentarily
 * blocked isn't either.
 *
 * Rooks are excluded while they're still at home: an undeveloped rook on a1 in
 * the middlegame is normal, whereas a bishop on c1 is a real complaint.
 */
export function passivePiece(fen: string, color: Color): PassivePiece | null {
  const map = buildAttackMap(fen);
  const mine = piecesOf(fen, color);
  const occupiedByMe = new Set(mine.map((p) => p.square));
  const homeRank = color === "w" ? "1" : "8";

  let worst: { p: PassivePiece; score: number } | null = null;
  for (const p of mine) {
    if (p.type === "p" || p.type === "k" || p.type === "r") continue;
    const value = squareValue(p.type, color, p.square);

    let scope = 0;
    for (const [square, attackers] of map) {
      if (occupiedByMe.has(square)) continue;
      if (attackers.some((a) => a.from === p.square)) scope++;
    }

    // Two independent ways to be passive, and the table alone isn't enough for
    // either. A bishop walled in on c1 scores only -10 there — the back rank is
    // barely penalised in the bishop table — so gating on the table value would
    // miss the most common case in the game. Nothing to move to IS the problem.
    const entombed = scope <= 1;
    const badSquare = value <= -30 && scope <= 4;
    if (!entombed && !badSquare) continue;

    const score = value - scope * 10;
    if (!worst || score < worst.score) {
      worst = {
        p: {
          type: p.type, square: p.square, stillHome: p.square[1] === homeRank,
          reason: entombed ? "entombed" : "badSquare",
        },
        score,
      };
    }
  }
  return worst?.p ?? null;
}
