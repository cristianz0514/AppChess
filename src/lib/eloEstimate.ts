// Rough "performance Elo" estimate from average centipawn loss (ACPL) — the
// same idea chess.com's post-game review shows for both sides, not just the
// tracked player. This is NOT a scientific rating, just a monotonic
// piecewise-linear curve over commonly-cited ACPL/rating anchor points, so
// it should be labeled as an estimate wherever it's shown, never as a real
// rating.
//
// The top end used to start at ACPL 5 → 2700, which our engine pass can't
// actually back up: most positions are only evaluated at a shallow depth
// (8 ply — see SHALLOW_DEPTH in blunderDetector.ts), with just a handful of
// the worst positions re-checked at depth 12. That resolution can't
// reliably tell a 2700-strength move from a 2200-strength one in a quiet
// position, so a very low ACPL (common on short games or ones that stay in
// known opening theory the whole time) was reading out an implausibly high
// "super alta" Elo the caller couldn't actually stand behind. Compressed
// the curve so the ceiling matches what a depth 8-12 engine pass can
// credibly distinguish, and callers should additionally exclude book moves
// and require a minimum sample size before trusting this (see GameViewer.tsx).
const ANCHORS: [acpl: number, elo: number][] = [
  [15, 2400],
  [25, 2200],
  [40, 2000],
  [60, 1800],
  [85, 1600],
  [120, 1400],
  [160, 1200],
  [220, 1000],
  [300, 800],
  [450, 600],
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
