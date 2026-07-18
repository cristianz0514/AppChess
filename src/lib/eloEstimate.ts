// Rough "performance Elo" estimate from average centipawn loss (ACPL) — the
// same idea chess.com's post-game review shows for both sides, not just the
// tracked player. This is NOT a scientific rating, just a monotonic
// piecewise-linear curve over commonly-cited ACPL/rating anchor points, so
// it should be labeled as an estimate wherever it's shown, never as a real
// rating.
const ANCHORS: [acpl: number, elo: number][] = [
  [5, 2700],
  [10, 2500],
  [20, 2300],
  [30, 2100],
  [45, 1900],
  [65, 1700],
  [90, 1500],
  [120, 1300],
  [160, 1100],
  [220, 900],
  [320, 700],
  [500, 500],
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
