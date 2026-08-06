// Performance Elo estimated from average centipawn loss.
//
// ── This is the PUBLISHED formula, not a hand-made curve ──────────────────────
//
//     Elo = 3100 * e^(-0.01 * ACPL)
//
// It is the relationship circulated in the Lichess community and it reproduces its
// own stated reference points exactly: ACPL 21.5 -> 2500 (GM), 34 -> 2200 (master),
// 54 -> 1800 (expert), 95 -> 1200 (average), 100 -> 1140.
//
// It replaces a ten-entry anchor table I had recalibrated by hand. That table was
// fitted: its scale came from making one measured median land on one measured
// rating, over 36 games that all sit in a single rating band. A train/test split
// showed why that was worthless as evidence — predicting a CONSTANT beat every
// predictor (median |error| 15 vs 46-60), because with no rating variance to explain,
// any shrinkage toward the middle looks like skill. The table was measuring the
// dataset. A published closed form has no knobs to fit, which is the point.
//
// ── The real bias is in the MEASUREMENT, not the mapping ──────────────────────
//
// The formula implies a 1040 player should show ACPL ~109. Ours measures 50-57 for
// exactly such players, in BLITZ, which should run HIGHER than classical, not lower.
// So the app under-reports loss by roughly half, and the mapping was being blamed
// for it.
//
// Three things were checked and are NOT the cause:
//   - The cap. python-chess-annotator uses MAX_CPL = 2000 and a plain mean; so do we.
//   - The averaging. Harmonic blends and per-move caps of 200 both improved the
//     in-sample number and failed out of sample.
//   - The definition. `prev - cur` from the mover's side IS "best minus played":
//     a search's evaluation of a position already IS the value of playing its best
//     move, so evaluating the position before the move gives the best-play value.
//
// What remains is DEPTH. SHALLOW_DEPTH is 12, and a shallow search cannot see the
// refutations that make a move bad, so it records smaller losses. The reference
// annotators analyse far deeper.
//
// Two honest ways forward, and they are a product decision rather than a code one:
//   (a) Raise SHALLOW_DEPTH until ACPL matches the published scale. Structural, and
//       it costs analysis time on the user's own CPU.
//   (b) Keep depth 12 and apply ONE explicitly-labelled depth-correction factor,
//       measured against real ratings. Still a fitted parameter, but one with a
//       physical meaning instead of ten hand-placed anchors.
// Neither is applied here: the formula is left faithful so the gap stays visible
// instead of being papered over. See DEPTH_NOTE below when wiring a correction.
const MAX_CPL = 2000;   // same ceiling the reference implementations use

/**
 * ACPL for rating estimation: per-move losses capped at MAX_CPL, then averaged.
 * Plain mean on purpose — every "improvement" tried on top of it (harmonic blend,
 * tighter cap) turned out to be fitted to a single-rating-band sample.
 */
export function acplForElo(losses: number[]): number | null {
  if (losses.length === 0) return null;
  const capped = losses.map((v) => Math.min(v, MAX_CPL));
  return capped.reduce((s, v) => s + v, 0) / capped.length;
}

export function estimateEloFromAcpl(acpl: number): number {
  // The published closed form, with no fitted terms. Verified against its own
  // reference points: 34 -> 2210, 54 -> 1810, 95 -> 1200, 100 -> 1140.
  //
  // Clamped at both ends, and the ceiling is the honest part: a depth-12 sweep
  // cannot tell a 2700-strength move from a 2200-strength one in a quiet position,
  // so the formula's upper reach is beyond what this measurement can support even
  // where the formula itself is sound.
  const raw = 3100 * Math.exp(-0.01 * Math.max(0, acpl));
  return Math.round(Math.max(400, Math.min(2400, raw)) / 10) * 10;
}
