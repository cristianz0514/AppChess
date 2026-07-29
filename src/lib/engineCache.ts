// One search per position, reused by whoever needs it.
//
// The analysis makes two deep passes over overlapping positions. For an error at
// ply i, the deepening pass evaluated fens[i] and fens[i-1] at depth 16, and the
// comment pass then searched fens[i-1] (MultiPV 2) and fens[i] (MultiPV 1) at
// depth 16 — the same two positions, at the same depth, twice. It was invisible
// while the two passes used different depths (16 and 18) because the searches
// looked different; equalising them exposed it.
//
// The useful rule is that a WIDER search contains a narrower one: MultiPV 2
// returns line 1 and line 2, and line 1 is exactly what MultiPV 1 would return.
// So a cached MultiPV 2 result can serve a MultiPV 1 request, and the deepening
// pass switching to MultiPV 2 pre-computes what the comment pass was about to ask
// for anyway.
//
// SCOPE: one cache per analysis run, created by the caller. Not a module-level
// global, and not shared app-wide, for two measured reasons:
//   • Within a game, positions don't repeat (barring repetition), so the only
//     hits are the two-pass overlap — which a per-run cache captures completely.
//   • The other engine consumers (/api/bestmove, /api/champions/move,
//     /api/exercise, services/puzzles) run on the SERVER while game analysis runs
//     in the BROWSER. Different processes, no shared memory, zero possible hits.
//
// Positions DO repeat across games that share an opening, which is a real saving
// for batch analysis — but that needs a session-scoped cache with eviction, and
// it's a separate, separately-measured change.

import type { CoachEngine, PositionAnalysis } from "./engineApi";

export interface EngineCache {
  /** The strongest cached result usable for this request, or a fresh search. */
  getAnalysis(fen: string, depth: number, multipv: number): Promise<PositionAnalysis>;
}

interface Entry {
  multipv: number;
  promise: Promise<PositionAnalysis>;
}

export function createEngineCache(engine: CoachEngine): EngineCache {
  // Keyed by fen|depth only. MultiPV is compared rather than keyed, because that
  // is what lets a wider result satisfy a narrower request.
  const byPosition = new Map<string, Entry>();

  return {
    async getAnalysis(fen, depth, multipv) {
      const key = `${fen}|${depth}`;
      const existing = byPosition.get(key);

      if (existing && existing.multipv >= multipv) {
        const cached = await existing.promise;
        // Trim to what was asked for, so a caller requesting one line can't
        // accidentally depend on a second line only present because another
        // caller happened to ask for two first.
        return { ...cached, lines: cached.lines.slice(0, multipv) };
      }

      // Stored as the PROMISE, not the result: two callers asking for the same
      // position before the first search returns must share it rather than start
      // a second one. Every search is serialised through the single engine, so
      // without this the second caller would simply queue and duplicate the work.
      const promise = engine
        .getTopLines(fen, depth, multipv)
        .then((lines) => ({ fen, depth, lines }));
      byPosition.set(key, { multipv, promise });

      try {
        return await promise;
      } catch (e) {
        // A failed search must not be remembered as a result — the next caller
        // should be free to retry.
        byPosition.delete(key);
        throw e;
      }
    },
  };
}
