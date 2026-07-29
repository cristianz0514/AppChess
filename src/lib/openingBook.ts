import { ECO_LINES } from "./ecoOpenings";
import { ECO_POSITIONS } from "./ecoPositions";

// A curated list of common opening lines (SAN, from the starting position)
// used to flag "book"/theory moves — chess.com-style — during game review.
//
// This is NOT an exhaustive ECO database (that's tens of thousands of
// lines); it's broad coverage of the openings players actually run into
// most, so a typical game's early moves get correctly flagged. A move past
// where every curated line ends (or one that deviates from all of them)
// simply isn't flagged as book — same honest limitation chess.com's own
// "out of book" moment has, just with a smaller book.
const OPENING_LINES: string[] = [
  // Open games (1.e4 e5)
  "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7",
  "e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6",
  "e4 e5 Nf3 Nc6 Bb5 Nf6",
  "e4 e5 Nf3 Nc6 Bb5 Nd4",
  "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4",
  "e4 e5 Nf3 Nc6 Bc4 Nf6",
  "e4 e5 Nf3 Nc6 d4 exd4 Nxd4",
  "e4 e5 Nf3 Nc6 Nc3 Nf6",
  "e4 e5 Nf3 Nf6",
  "e4 e5 Nf3 d6",
  "e4 e5 Nc3 Nf6",
  "e4 e5 f4",
  "e4 e5 Bc4",
  "e4 e5 d4 exd4 Qxd4",
  "e4 e5 d4 exd4 c3",
  // Semi-open (1.e4, Black replies other than e5)
  "e4 d5 exd5 Qxd5",
  "e4 Nf6",
  "e4 d6 d4 Nf6 Nc3 g6",
  "e4 g6",
  "e4 c6 d4 d5",
  "e4 c6 d4 d5 e5",
  "e4 c6 d4 d5 exd5 cxd5",
  "e4 e6 d4 d5",
  "e4 e6 d4 d5 e5",
  "e4 e6 d4 d5 exd5 exd5",
  "e4 e6 d4 d5 Nc3 Bb4",
  "e4 c5",
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3",
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6",
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6",
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5",
  "e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6",
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6",
  "e4 c5 c3",
  "e4 c5 Nc3 Nc6 g3",
  // Queen's pawn (1.d4 d5)
  "d4 d5 c4 e6",
  "d4 d5 c4 dxc4",
  "d4 d5 c4 c6",
  "d4 d5 c4 c6 Nc3 Nf6 e3 e6",
  "d4 d5 Nf3 Nf6 Bf4",
  // Indian defenses (1.d4 Nf6)
  "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6",
  "d4 Nf6 c4 g6 Nc3 d5",
  "d4 Nf6 c4 e6 Nc3 Bb4",
  "d4 Nf6 c4 e6 Nf3 b6",
  "d4 Nf6 c4 e6 Nf3 Bb4",
  "d4 Nf6 c4 c5 d5",
  "d4 Nf6 c4 c5 d5 b5",
  "d4 Nf6 c4 e6 g3",
  "d4 Nf6 Bg5",
  "d4 Nf6 Nf3 e6 Bg5",
  // Other flank/queen's-pawn systems
  "d4 f5",
  "c4 e5",
  "c4 e5 Nc3 Nf6",
  "c4 c5",
  "Nf3 d5 c4",
  "Nf3 d5 g3",
  "f4 d5",
];

// The curated list above stays as a fallback, but the real coverage now comes
// from the full ECO dataset (lichess-org/chess-openings, CC0 — 3.8k lines
// generated into ecoOpenings.ts). With only the 73 curated lines an English
// Opening left the book at move 2, so four consecutive theory moves each got
// the generic "sacas la pieza y ganas actividad" comment.
const bookPrefixes = new Set<string>();
for (const line of [...OPENING_LINES, ...ECO_LINES]) {
  const sans = line.split(" ");
  for (let i = 1; i <= sans.length; i++) {
    bookPrefixes.add(sans.slice(0, i).join("|"));
  }
}

// ── Position-based book lookup ───────────────────────────────────────────────
// The sequence match below is kept, but position matching is the one that's
// right: a game reaching a known position by a different move order is still in
// the book. Real case — `e4 c6 Nf3 d5 e5 Bf5 d4` reaches a position the book
// holds as `e4 c6 d4 d5 e5 Bf5 Nf3`, and sequence matching called it out-of-book
// from move 3. Ten theory moves lost their book comment and the "theory ends
// here" marker fired at move 2 instead of move 7.
const bookPositions = new Set<number>(ECO_POSITIONS);

const hashPosition = (fen: string): number => {
  // Placement + side to move + castling only. Move counters must not
  // participate: the same position reached in a different number of moves is the
  // same position, which is the whole reason this exists.
  const [placement, turn, castling] = fen.split(" ");
  const key = `${placement} ${turn} ${castling}`;
  let x = 5381;
  for (let i = 0; i < key.length; i++) x = ((x * 33) ^ key.charCodeAt(i)) >>> 0;
  return x;
};

/**
 * Whether this POSITION is a known opening position. `fen` is the position AFTER
 * the move in question.
 *
 * Preferred over isBookMove wherever the caller already has the FEN, which both
 * real callers do.
 */
export function isBookPosition(fen: string | null | undefined): boolean {
  if (!fen) return false;
  return bookPositions.has(hashPosition(fen));
}

// Whether the move at `plyIndex` (0-indexed) continues a known opening line by
// EXACT move order. Retained for callers without a FEN to hand; prefer
// isBookPosition, which also matches transpositions.
export function isBookMove(sanHistory: string[], plyIndex: number): boolean {
  if (plyIndex < 0 || plyIndex >= sanHistory.length) return false;
  const key = sanHistory.slice(0, plyIndex + 1).join("|");
  return bookPrefixes.has(key);
}
