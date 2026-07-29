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
 * Anything that can answer the three questions the coach asks. Implemented once
 * for the browser (Stockfish in a Web Worker) so the analysis pipeline itself
 * never needs to know where the engine lives.
 */
export interface CoachEngine {
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

/** A MultiPV `info` line: which line index it is, and its score plus variation. */
export function parseMultiPvLine(line: string, maxPlies = 6):
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
