import { Chess, type Square } from "chess.js";

// Rule-based tactical-pattern detection — grounded in real board geometry
// (ray-casting over the actual position), not the AI guessing. Uses the
// standard Spanish chess vocabulary for these patterns (the same terms
// Lichess/chess.com use in Spanish) so coach comments name what actually
// happened instead of describing it vaguely ("perdiste actividad").

export interface DetectedMotif {
  key: "fork" | "pin" | "skewer" | "discovered" | "hanging" | "hangs_own";
  label: string; // Spanish, ready to drop into a sentence — matches Lichess's
  // own puzzle-theme translations exactly (lichess.org/training/themes) so
  // this vocabulary lines up with what players already see there.
  // Which piece/square, when the motif is about one specific piece (hanging
  // and hangs_own) — lets the caller name it explicitly instead of leaving
  // the model to guess (it reliably guesses wrong, e.g. blaming the piece
  // that just moved when it's actually a DIFFERENT piece left undefended).
  square?: string;
  pieceName?: string; // Spanish piece name, ready to drop into a sentence
}

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const PIECE_NAME_ES: Record<string, string> = { p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey" };
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

// Absolute pin (clavada) or skewer (pincho): from a sliding piece, the first
// enemy piece hit along a direction, followed (nothing in between) by a
// second enemy piece on the same line. If that second piece is the king, the
// front piece is pinned to it. If the front piece is worth MORE than the
// piece behind it, moving the front piece exposes the cheaper one — a
// skewer. Classic ray-cast detection, same geometry for both patterns.
function detectPinOrSkewer(chess: Chess, sq: string, type: string, color: "w" | "b"): "pin" | "skewer" | null {
  if (type !== "b" && type !== "r" && type !== "q") return null;
  const dirs = type === "b" ? BISHOP_DIRS : type === "r" ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
  const [f, r] = fileRank(sq);
  const oppColor = color === "w" ? "b" : "w";
  for (const [df, dr] of dirs) {
    let nf = f + df, nr = r + dr;
    let front: { type: string } | null = null;
    for (;;) {
      const s = toSquare(nf, nr);
      if (!s) break;
      const p = chess.get(s as Square);
      if (p) {
        if (!front) {
          if (p.color === oppColor && p.type !== "k") { front = p; nf += df; nr += dr; continue; }
          break; // own piece, or the king itself right away — nothing to pin/skewer
        }
        if (p.color === oppColor) {
          if (p.type === "k") return "pin";
          if (PIECE_VALUE[front.type] > PIECE_VALUE[p.type]) return "skewer";
        }
        break;
      }
      nf += df; nr += dr;
    }
  }
  return null;
}

// Is `square` defended by any piece of `byColor`? Used to confirm a piece
// the mover now attacks is genuinely undefended (colgada), not just attacked.
function isSquareAttackedBy(chess: Chess, square: string, byColor: "w" | "b"): boolean {
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
    const s = toSquare(f, r)!;
    const p = chess.get(s as Square);
    if (p && p.color === byColor && attackedSquares(chess, s, p.type, byColor).includes(square)) return true;
  }
  return false;
}

// The mirror image of "hanging": after playing the move, is one of the
// MOVER's OWN pieces (knight or up) now attacked with zero defenders? This
// is the single most common real blunder (walking a piece into an attack,
// or unguarding one by moving its defender away) — distinct from the other
// motifs, which all describe threats the mover creates against the
// opponent, not exposure the mover creates for themselves.
function ownPieceHanging(chess: Chess, myColor: "w" | "b"): { square: string; type: string } | null {
  const oppColor = myColor === "w" ? "b" : "w";
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
    const s = toSquare(f, r)!;
    const p = chess.get(s as Square);
    if (!p || p.color !== myColor || PIECE_VALUE[p.type] < 3) continue;
    if (isSquareAttackedBy(chess, s, oppColor) && !isSquareAttackedBy(chess, s, myColor)) return { square: s, type: p.type };
  }
  return null;
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

  const attackedSqs = attackedSquares(after, move.to, move.piece, myColor);
  const enemyTargets = attackedSqs
    .map((s) => ({ sq: s, piece: after.get(s as Square) }))
    .filter((t): t is { sq: string; piece: NonNullable<ReturnType<Chess["get"]>> } => !!t.piece && t.piece.color === oppColor);

  // Fork (horquilla) — the piece that just moved now attacks 2+ enemy pieces
  // each worth more than a pawn (a real simultaneous double attack).
  if (enemyTargets.filter((t) => PIECE_VALUE[t.piece.type] >= 3).length >= 2) {
    motifs.push({ key: "fork", label: "horquilla" });
  }

  // Pieza colgada — an enemy piece (knight or up; pawns excluded) the mover
  // now attacks with zero defenders of its own. Pawns are deliberately
  // excluded: an undefended pawn attacked by a routine developing move
  // (e.g. 2.Nf3 eyeing an undefended e5) is normal opening tension the
  // opponent fixes on their very next move, not a real "hanging piece" —
  // flagging it as one reads as a false tactical claim to anyone who
  // actually knows the position.
  const hanging = enemyTargets.find((t) => PIECE_VALUE[t.piece.type] >= 3 && !isSquareAttackedBy(after, t.sq, oppColor));
  if (hanging) motifs.push({ key: "hanging", label: "pieza colgada", square: hanging.sq, pieceName: PIECE_NAME_ES[hanging.piece.type] });

  // Pin (clavada) / skewer (pincho) — same ray-cast geometry, distinguished
  // by whether the piece behind the front one is the king or just cheaper.
  const pinOrSkewer = detectPinOrSkewer(after, move.to, move.piece, myColor);
  if (pinOrSkewer === "pin") motifs.push({ key: "pin", label: "clavada" });
  else if (pinOrSkewer === "skewer") motifs.push({ key: "skewer", label: "pincho" });

  // Ataque a la descubierta (discovered attack/check) — in check, but not
  // from the piece that just moved (Lichess's exact Spanish theme name).
  if (after.inCheck()) {
    const kingSq = findKing(after, oppColor);
    const moverGivesCheck = kingSq ? attackedSqs.includes(kingSq) : true;
    if (!moverGivesCheck) motifs.push({ key: "discovered", label: "ataque a la descubierta" });
  }

  // Pieza propia colgada — checked last and independent of the move's own
  // destination square, since it can come from the moved piece walking into
  // an attack OR from a completely different piece losing its defender.
  const selfHang = ownPieceHanging(after, myColor);
  if (selfHang) motifs.push({ key: "hangs_own", label: "pieza propia colgada", square: selfHang.square, pieceName: PIECE_NAME_ES[selfHang.type] });

  return motifs;
}
