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

const bookPrefixes = new Set<string>();
for (const line of OPENING_LINES) {
  const sans = line.split(" ");
  for (let i = 1; i <= sans.length; i++) {
    bookPrefixes.add(sans.slice(0, i).join("|"));
  }
}

// Whether the move at `plyIndex` (0-indexed) continues a known opening line,
// given the game's full SAN history so far.
export function isBookMove(sanHistory: string[], plyIndex: number): boolean {
  if (plyIndex < 0 || plyIndex >= sanHistory.length) return false;
  const key = sanHistory.slice(0, plyIndex + 1).join("|");
  return bookPrefixes.has(key);
}
