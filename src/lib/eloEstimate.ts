// Performance Elo estimated from average centipawn loss — CALIBRATED against real ratings.
//
// ── What this replaced, and why ───────────────────────────────────────────────
//
// The first version used the published relationship Elo = 3100·e^(−0.01·ACPL). It was never
// checked against anything: the code itself said "NOT YET VERIFIED", and the user kept
// reporting that the number came out "muy alta". It was right to doubt it. scripts/
// calibrateElo.mts now runs the app's REAL analysis (analyzeGame, depth 16) over 102 public
// chess.com games (204 player-games, ratings 246-3375) whose players' ratings are known, and
// compares. What it found:
//
//   1. The published curve is far too steep for ONE game. It maps ACPL 20 to 2400 and ACPL
//      200 to 420. On the app's own user — eight real games of a ~1030 player — it said
//      anything from 400 to 2400 (2250 and 2400 on the clean games). Over the whole sample it
//      was off by 700 points (rmse), overestimating the 600-1200 players by 250-580.
//   2. A single game barely identifies a rating at all. Out of sample (leave-one-GAME-out,
//      ratings 400-2500) the fitted model's error is 426 points rmse, against 460 for always
//      guessing the average rating. A game is 25-40 moves of one person's afternoon: ACPL
//      swings with the opening, the position's complexity and one lapse.
//
// So two things change, and they are the two things the data supports:
//
//   • the CURVE is the fitted one (ln Elo = a − b·ACPL), which is gentler and so stops
//     producing 2400s from clean games;
//   • the number is shown WITH its uncertainty. A bare "1070" claims a precision the
//     measurement does not have; "≈1070, probable entre 700 y 1600" is what it actually knows.
//
// What is still true, and cannot be fixed by a better formula: an estimate from one game
// regresses toward the middle of the population (about 1300 in the sample). It reads a bit
// high for a 700 player and a bit low for a 2000 one — that is the honest price of a weak
// predictor, and it is why the real rating is displayed next to it.
//
// Per-move loss is capped at 300 (not 2000) before averaging: a catastrophe says that one
// move was a catastrophe, not that the player is a beginner, and the capped mean predicted
// rating better out of sample than the uncapped one (r −0.50 vs −0.33; rmse 559 vs 616).
//
// The constants below come from scripts/calibrateElo.mts and are only as good as that
// sample. They are one place on purpose: re-run the script after a change to depth or to
// the classification and update them here, nowhere else.

/** Per-move loss ceiling, in centipawns. Chosen by out-of-sample comparison, see above. */
export const LOSS_CAP = 300;

/** ln(Elo) = LN_A − B·ACPL, fitted by scripts/calibrateElo.mts on ratings 400-2500. */
export const LN_A = 7.52;
export const B = 0.0064;

/** The shown range is [Elo/FACTOR, Elo·FACTOR]. Out of sample it contained the real rating
 *  about 80% of the time (79% at 1.5; 51% at 1.3, 90% at 1.7). It is wide ON PURPOSE: that
 *  width is how little one game says. */
export const RANGE_FACTOR = 1.5;

/** Displayed Elo is clamped here. Below 400 and above 2400 the data cannot tell (the fitted
 *  curve itself tops out near 1850: one game cannot separate a strong player from a medium one). */
export const ELO_FLOOR = 400;
export const ELO_CEILING = 2400;

/**
 * Real, post-book moves needed before any number is shown. A short sample is mostly noise:
 * the first version asked for 6, and a six-move "average" is one lapse away from either end
 * of the scale.
 */
export const MIN_MOVES_FOR_ELO = 12;

export interface EloEstimate {
  /** Best single guess, rounded to 10. */
  elo: number;
  /** Range that held the real rating about 80% of the time out of sample, rounded to 50. */
  low: number;
  high: number;
}

/**
 * ACPL for rating estimation: per-move losses capped at LOSS_CAP, then averaged. A plain mean
 * on purpose — every cleverer average tried (harmonic, tighter caps) was fitted to a
 * single-rating-band sample and failed out of sample.
 */
export function acplForElo(losses: number[]): number | null {
  if (losses.length === 0) return null;
  const capped = losses.map((v) => Math.min(Math.max(v, 0), LOSS_CAP));
  return capped.reduce((s, v) => s + v, 0) / capped.length;
}

const clampElo = (v: number) => Math.max(ELO_FLOOR, Math.min(ELO_CEILING, v));
const round = (v: number, to: number) => Math.round(v / to) * to;

/** The calibrated curve, as a plain number. `acpl` is the capped average from acplForElo. */
export function estimateEloFromAcpl(acpl: number): number {
  return round(clampElo(Math.exp(LN_A - B * Math.max(0, acpl))), 10);
}

/**
 * The estimate, with its range, from a player's per-move losses (book moves already
 * excluded by the caller). Null when there are too few moves to say anything.
 */
export function estimateElo(losses: number[]): EloEstimate | null {
  if (losses.length < MIN_MOVES_FOR_ELO) return null;
  const acpl = acplForElo(losses);
  if (acpl === null) return null;
  const raw = Math.exp(LN_A - B * Math.max(0, acpl));
  const elo = clampElo(raw);
  return {
    elo: round(elo, 10),
    low: Math.max(ELO_FLOOR, round(elo / RANGE_FACTOR, 50)),
    high: round(elo * RANGE_FACTOR, 50),
  };
}
