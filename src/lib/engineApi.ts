// The engine contract, plus the UCI line parsing both implementations share.
//
// Why shared and not copied into each side: the mate-sign handling below was a
// real bug that made a checkmate the PLAYER delivered read as "mate forzado en
// contra". Duplicating this parsing means the next fix lands on one side only
// and the bug comes back wherever it wasn't applied.

export interface EvalResult {
  score: number;      // pawns, side-to-move perspective; |score| ≈ 10000 means mate
  mate: number | null;
}

export interface EngineLine {
  mate: number | null;
  scoreCp: number | null;
  pv: string[];
}

/**
 * A whole search result, kept rather than reduced to a single number.
 *
 * The analysis used to ask "what's the evaluation?" in one pass and "what's the
 * best line?" in another, and throw away everything it didn't immediately need.
 * But a MultiPV search already contains both: the score, the best move, the
 * second best, and therefore the gap between them. Splitting those into separate
 * questions was an artificial distinction that cost a duplicate search.
 *
 * Deliberately no `nodes`, `nps`, `hashfull` or `time`: nothing consumes them,
 * and a field nobody reads is exactly what scripts/auditCoverage.cjs exists to
 * catch. They can be added when something actually needs them.
 */
export interface PositionAnalysis {
  fen: string;
  depth: number;
  lines: EngineLine[];
}

/**
 * Anything that can answer the three questions the coach asks. Implemented once
 * for the browser (Stockfish in a Web Worker) so the analysis pipeline itself
 * never needs to know where the engine lives.
 */
export interface CoachEngine {
  /**
   * Clear the engine's state before a fresh analysis.
   *
   * Not cosmetic. The transposition table persists across searches, and the
   * worker is reused between analyses, so a second run of the SAME game started
   * from a hash already full of the first run's results — and returned different
   * answers. Measured over 42 moves with identical code: 15 classifications
   * differed between consecutive runs and 2 of them crossed the
   * error/not-an-error line, so re-analysing a game could make a move sprout a
   * "?!" badge for no reason the player could see.
   *
   * Called once per game, never between positions inside one: the hash sharing
   * WITHIN a run is what makes the sweep fast, and it's deterministic there
   * because the order is fixed.
   */
  newGame?(): Promise<void>;
  evaluatePosition(fen: string, depth?: number): Promise<EvalResult>;
  getTopLines(fen: string, depth?: number, multipv?: number): Promise<EngineLine[]>;
  analyzeAllFens(
    fens: string[], depth?: number, onProgress?: (done: number, total: number) => void,
  ): Promise<(EvalResult | null)[]>;
}

export const MATE_SCORE = 10000;

/**
 * Score from one `info` line, or null if it carries none.
 *
 * `mate N` with N>0 means the side to move DELIVERS mate; N<0 means it gets
 * mated. N==0 is what Stockfish reports for an ALREADY-mated position — the
 * worst possible score for the side to move. Lumping N==0 in with N>0 flips the
 * sign, which is how a checkmate the player delivered ended up described as mate
 * against them.
 */
export function parseScore(line: string): EvalResult | null {
  const mateMatch = line.match(/score mate (-?\d+)/);
  if (mateMatch) {
    const n = parseInt(mateMatch[1]);
    const mag = MATE_SCORE - Math.min(Math.abs(n), 99);
    return { score: n > 0 ? mag : -mag, mate: n };
  }
  const cpMatch = line.match(/score cp (-?\d+)/);
  if (cpMatch) return { score: parseInt(cpMatch[1]) / 100, mate: null };
  return null;
}

/**
 * The score of a MultiPV line on the SAME scale `parseScore` produces, so a line
 * and a plain evaluation are interchangeable.
 *
 * The two scales differ in a way that is easy to get wrong: centipawns are
 * divided by 100 to give pawns, but a mate score is NOT — it stays as
 * ±(MATE_SCORE − N), because the pipeline detects mates by testing the magnitude
 * against MATE_SCORE. Converting a line by hand and dividing the mate branch by
 * 100 as well produces 100 instead of 10000, and every mate silently stops being
 * recognised as one. This exists so that conversion lives in exactly one place.
 */
export function lineToScore(line: EngineLine): number {
  if (line.mate != null) {
    const mag = MATE_SCORE - Math.min(Math.abs(line.mate), 99);
    return line.mate > 0 ? mag : -mag;
  }
  return (line.scoreCp ?? 0) / 100;
}

/** A MultiPV `info` line: which line index it is, and its score plus variation. */
// 10 plies, not 6: the point of a move is usually its second or third follow-up,
// and a 6-ply window frequently cut the line off right before the idea landed.
export function parseMultiPvLine(line: string, maxPlies = 10):
  { index: number; value: EngineLine } | null {
  const mpv = line.match(/multipv (\d+)/);
  const pvm = line.match(/ pv (.+)$/);
  if (!mpv || !pvm) return null;
  const mate = line.match(/score mate (-?\d+)/);
  const cp = line.match(/score cp (-?\d+)/);
  return {
    index: parseInt(mpv[1]),
    value: {
      mate: mate ? parseInt(mate[1]) : null,
      scoreCp: cp ? parseInt(cp[1]) : null,
      pv: pvm[1].trim().split(/\s+/).slice(0, maxPlies),
    },
  };
}
