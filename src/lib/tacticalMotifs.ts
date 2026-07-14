import { Chess, type Square } from "chess.js";

// Rule-based tactical-pattern detection — grounded in real board geometry
// (ray-casting over the actual position), not the AI guessing. Uses the
// standard Spanish chess vocabulary for these patterns (the same terms
// Lichess/chess.com use in Spanish) so coach comments name what actually
// happened instead of describing it vaguely ("perdiste actividad").

export interface DetectedMotif {
  key: "fork" | "pin" | "discovered";
  label: string; // Spanish, ready to drop into a sentence
}

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const KNIGHT_OFFSETS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_OFFSETS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function fileRank(sq: string): [number, number] {
  return [sq.charCodeAt(0) - 97, parseInt(sq[1], 10) - 1];
}
function toSquare(f: number, r: number): string | null {
  if (f < 0 || f > 7 || r < 0 || r > 7) return null;
  return String.fromCharCode(97 + f) + (r + 1);
}

// Squares a piece of `type`/`color` on `sq` attacks in `chess`'s CURRENT
// position (occupancy blocks sliding pieces, as normal).
function attackedSquares(chess: Chess, sq: string, type: string, color: "w" | "b"): string[] {
  const [f, r] = fileRank(sq);
  const out: string[] = [];
  if (type === "n") {
    for (const [df, dr] of KNIGHT_OFFSETS) { const s = toSquare(f + df, r + dr); if (s) out.push(s); }
  } else if (type === "k") {
    for (const [df, dr] of KING_OFFSETS) { const s = toSquare(f + df, r + dr); if (s) out.push(s); }
  } else if (type === "p") {
    const dir = color === "w" ? 1 : -1;
    for (const df of [-1, 1]) { const s = toSquare(f + df, r + dir); if (s) out.push(s); }
  } else {
    const dirs = type === "b" ? BISHOP_DIRS : type === "r" ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
    for (const [df, dr] of dirs) {
      let nf = f + df, nr = r + dr;
      for (;;) {
        const s = toSquare(nf, nr);
        if (!s) break;
        out.push(s);
        if (chess.get(s as Square)) break; // first occupant stops the ray
        nf += df; nr += dr;
      }
    }
  }
  return out;
}

function findKing(chess: Chess, color: "w" | "b"): string | null {
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
    const s = toSquare(f, r)!;
    const p = chess.get(s as Square);
    if (p && p.type === "k" && p.color === color) return s;
  }
  return null;
}

// Absolute pin: from a sliding piece, the first enemy piece hit along a
// direction, followed (with nothing else in between) by the enemy king —
// classic ray-cast pin detection.
function detectPin(chess: Chess, sq: string, type: string, color: "w" | "b"): boolean {
  if (type !== "b" && type !== "r" && type !== "q") return false;
  const dirs = type === "b" ? BISHOP_DIRS : type === "r" ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
  const [f, r] = fileRank(sq);
  const oppColor = color === "w" ? "b" : "w";
  for (const [df, dr] of dirs) {
    let nf = f + df, nr = r + dr;
    let sawEnemy = false;
    for (;;) {
      const s = toSquare(nf, nr);
      if (!s) break;
      const p = chess.get(s as Square);
      if (p) {
        if (!sawEnemy) {
          if (p.color === oppColor && p.type !== "k") { sawEnemy = true; nf += df; nr += dr; continue; }
          break; // own piece, or the king itself right away — no pin
        }
        if (p.color === oppColor && p.type === "k") return true;
        break;
      }
      nf += df; nr += dr;
    }
  }
  return false;
}

// Detects tactical motifs created BY playing `san` from `fenBefore`. Returns
// an empty array if the move can't be replayed or nothing is detected —
// callers should only mention what's actually here, never invent one.
export function detectMotifs(fenBefore: string, san: string): DetectedMotif[] {
  const after = new Chess(fenBefore);
  let move;
  try { move = after.move(san); } catch { return []; }
  if (!move) return [];

  const motifs: DetectedMotif[] = [];
  const myColor = move.color as "w" | "b";
  const oppColor = myColor === "w" ? "b" : "w";

  // Fork — the piece that just moved now attacks 2+ enemy pieces each worth
  // more than a pawn (a real simultaneous double attack).
  const targets = attackedSquares(after, move.to, move.piece, myColor)
    .map((s) => after.get(s as Square))
    .filter((p): p is NonNullable<typeof p> => !!p && p.color === oppColor && PIECE_VALUE[p.type] >= 3);
  if (targets.length >= 2) motifs.push({ key: "fork", label: "horquilla" });

  // Pin — the piece that just moved pins an enemy piece to its king.
  if (detectPin(after, move.to, move.piece, myColor)) motifs.push({ key: "pin", label: "clavada" });

  // Discovered check — in check, but not from the piece that just moved.
  if (after.inCheck()) {
    const kingSq = findKing(after, oppColor);
    const moverGivesCheck = kingSq ? attackedSquares(after, move.to, move.piece, myColor).includes(kingSq) : true;
    if (!moverGivesCheck) motifs.push({ key: "discovered", label: "ataque descubierto" });
  }

  return motifs;
}
