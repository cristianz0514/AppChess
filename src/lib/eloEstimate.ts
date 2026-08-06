// Rough "performance Elo" estimate from average centipawn loss (ACPL) — the
// same idea chess.com's post-game review shows for both sides, not just the
// tracked player. This is NOT a scientific rating, just a monotonic
// piecewise-linear curve over commonly-cited ACPL/rating anchor points, so
// it should be labeled as an estimate wherever it's shown, never as a real
// rating.
//
// The top end used to start at ACPL 5 → 2700, which our engine pass can't
// actually back up: most positions get the shallow sweep (see SHALLOW_DEPTH in
// blunderDetector.ts, currently 12 — this comment said 14, which it has not been),
// with the worst positions re-checked deeper. Even that resolution can't
// reliably tell a 2700-strength move from a 2200-strength one in a quiet
// position, so a very low ACPL (common on short games or ones that stay in
// known opening theory the whole time) was reading out an implausibly high
// "super alta" Elo the caller couldn't actually stand behind. Compressed
// the curve so the ceiling matches what a depth 8-12 engine pass can
// credibly distinguish, and callers should additionally exclude book moves
// and require a minimum sample size before trusting this (see GameViewer.tsx).
//
// KNOWN, MEASURED, NOT YET FIXED: even with the anchors below correct on average
// (+2 points of bias over 12 games), a SINGLE game is not a usable estimate. The
// same 1035-rated player measured anywhere from 600 to 1980 across those games.
// The driver is visible in the data: games containing one move capped at the
// 2000cp ceiling scored ACPL 66-184, games without one scored 13-54 — a lone
// catastrophe adds ~100 to a 20-move average by itself. Lowering that per-move
// cap would compress the spread, but it changes centipawn_loss (which is stored
// and displayed) and would require re-deriving every anchor here, so it is a
// separate, separately-measured change. Until then, prefer aggregating across
// games over trusting any one of them.
// ── Recalibrated against this app's OWN measurements ─────────────────────────
//
// The anchors below used to be "commonly-cited" reference points from other tools,
// and they had never been checked against a real rating. Measured over every
// analysed game in the database that carries one (476 games; 30 with a usable
// `ply` on their move rows, 24 of them in one band):
//
//     real rating 900-1100  ->  median ACPL 54  ->  the old curve said 1860
//
// An +817 point bias at the level this app is actually used at.
//
// The cause is that `centipawn_loss` here is not interchangeable with other tools'
// ACPL. The sweep runs at SHALLOW_DEPTH (12): a shallow search finds SMALLER losses
// than a deep one, because it cannot see the refutations that make a move bad. So
// this app's ACPL sits at roughly HALF the value a deep analysis reports for the
// same strength — 54 where published curves would expect ~105 at 1040. Importing
// their anchors therefore read every player as about 800 points stronger.
//
// These anchors keep the shape of that published relationship (roughly logarithmic)
// and halve the ACPL axis, which puts the curve through the one point actually
// measured: ACPL 54 interpolates to ~1050 against a real 1043.
//
// HONEST LIMITS. One rating band, one engine depth, and the shape between anchors
// is assumed rather than measured. Re-run scripts against a wider spread of ratings
// before trusting the ends of this curve, and re-derive it entirely if
// SHALLOW_DEPTH changes — the whole scale moves with it.
const ANCHORS: [acpl: number, elo: number][] = [
  [6, 2400],
  [9, 2200],
  [13, 2000],
  [16, 1800],
  [21, 1600],
  [31, 1400],
  [43, 1200],
  [58, 1000],
  [75, 800],
  [100, 600],
];

export function estimateEloFromAcpl(acpl: number): number {
  if (acpl <= ANCHORS[0][0]) return ANCHORS[0][1];
  const last = ANCHORS[ANCHORS.length - 1];
  if (acpl >= last[0]) return last[1];
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [aLo, eLo] = ANCHORS[i];
    const [aHi, eHi] = ANCHORS[i + 1];
    if (acpl >= aLo && acpl <= aHi) {
      const t = (acpl - aLo) / (aHi - aLo);
      return Math.round((eLo + (eHi - eLo) * t) / 10) * 10;
    }
  }
  return last[1];
}
