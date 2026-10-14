// Stockfish running in the USER'S browser, in a Web Worker.
//
// This is where the engine belonged all along. The build we load, `lite-single`,
// is a browser build — running it inside a Node server was the unusual choice.
// Moving it here:
//
//   • removes the memory ceiling entirely (the free-tier 512MB was the binding
//     constraint on search depth, and the reason deep sweeps crashed the process)
//   • uses the CPU of whoever is actually looking at the page, which beats a
//     shared free-tier core comfortably
//   • deletes the global one-at-a-time lock. That lock existed only because there
//     was ONE engine on ONE server; with an engine per browser, two people
//     analysing at the same time stop queueing behind each other
//
// The engine lives in a Worker so a 600ms search never freezes the page. The
// rest of the pipeline (chess.js, the attack tables, the templates) stays on the
// main thread: it costs microseconds per move and every await yields anyway.
//
// ── Three failure modes this file is written around ──────────────────────────
//
// 1. A SEARCH CUT SHORT must not leak into the next one. The old deadline resolved the
//    promise and walked away from a search that was still running. The next position's
//    `position`/`go` then queued behind it, the old search's `info` lines fed the NEW
//    handler, and its `bestmove` ended the new search early — so one slow position could
//    misattribute scores to the positions after it. A deadline now sends `stop` and waits
//    for the engine's own `bestmove`, which is the only moment it is really idle again.
//
// 2. A WEDGED OR CRASHED ENGINE must not read as "equal position". With no `info` line,
//    evaluateOne used to return {score: 0}, and every position after a WASM crash
//    ("memory access out of bounds") was silently classified as dead level. No score is now
//    a failure: the worker is replaced and the position retried once, and only then does
//    the caller see an error (which analyzeAllFens turns into a missing evaluation).
//
// 3. THE DEADLINE MUST NOT BE WHAT DECIDES THE DEPTH. The average-centipawn-loss behind the
//    Elo estimate only means something at a consistent depth: a phone that hits a 10-second
//    cap at depth 11 records smaller losses than a laptop at depth 16, and the estimate
//    drifts up by device. The deadlines below are a safety net for a hung engine, not a
//    time budget — a slow device takes longer instead of searching shallower.

import {
  type CoachEngine, type EngineLine, type EvalResult,
  parseScore, parseMultiPvLine,
} from "./engineApi";
import {
  type BuildId, chooseBuild, fallbackAfter, markBuildFailed, threadsFor,
} from "./engineBuild";

interface Pending {
  onLine: (line: string) => void;
  /** The worker died (onerror) while this search was waiting. */
  onDead?: () => void;
}

/** Soft deadline per position. At depth 16 a desktop needs ~1s and a phone ~5-10s; this
 *  leaves ample room before `stop` is sent, so depth is reached rather than truncated. */
export const SOFT_EVAL_MS = 60_000;
/** Soft deadline for a MultiPV search (slower: it searches several lines to full depth). */
export const SOFT_LINES_MS = 120_000;
/** After `stop`, how long the engine gets to produce its `bestmove` before it counts as wedged. */
export const HARD_AFTER_STOP_MS = 8_000;

let workerPromise: Promise<Worker> | null = null;
let chain: Promise<unknown> = Promise.resolve();
let current: Pending | null = null;
let needsRestart = false;
let activeBuild: { id: BuildId; label: string; megabytes: number; threads: number } | null = null;

/** Which build ended up running, for the UI to report honestly. */
export const activeEngineBuild = () => activeBuild;

/** Serialises every search: there is one engine, and UCI is a single conversation. */
function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  // Keep the chain alive after a rejection so one failed search doesn't wedge
  // every later one.
  chain = next.then(() => undefined, () => undefined);
  return next;
}

/** Loads one specific build, or throws. */
async function bootBuild(
  file: string, megabytes: number, threads: number, hashMb: number,
): Promise<Worker> {
  const worker = new Worker(`/engine/${file}`);
  worker.onmessage = (e: MessageEvent) => {
    const line = typeof e.data === "string" ? e.data : "";
    if (line) current?.onLine(line);
  };

  try {
    await new Promise<void>((resolve, reject) => {
      // The deadline scales with the download: 108MB over a slow-but-usable
      // connection legitimately takes minutes, and killing it at 60s would
      // demote a device that was going to succeed.
      const budgetMs = 45000 + megabytes * 2000;
      const timer = setTimeout(
        () => reject(new Error(`El motor (${megabytes} MB) tardó demasiado en cargar`)),
        budgetMs,
      );
      worker.onerror = (err) => { clearTimeout(timer); reject(new Error(`El motor falló al cargar: ${err.message}`)); };
      current = {
        onLine: (line) => {
          if (line === "readyok") { clearTimeout(timer); current = null; resolve(); }
        },
      };
      worker.postMessage("uci");
      worker.postMessage(`setoption name Threads value ${threads}`);
      worker.postMessage(`setoption name Hash value ${hashMb}`);
      worker.postMessage("isready");
    });
  } catch (e) {
    worker.terminate();
    throw e;
  }
  // Booted. From here a worker error means the engine died mid-analysis (the WASM heap
  // running out is the usual cause): flag it for replacement and wake whoever is waiting.
  worker.onerror = () => {
    needsRestart = true;
    const waiting = current;
    current = null;
    waiting?.onDead?.();
  };
  return worker;
}

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { build, capabilities } = chooseBuild();

      // Walk down from the chosen build. A capability check can be wrong or
      // simply unavailable; a failed load cannot. So each failure is recorded
      // and the next build down is tried, which is what makes shipping the
      // 108MB net safe on devices that can't hold it.
      let candidate: { id: BuildId; file: string; megabytes: number; threaded: boolean; label: string } | null = build;
      let lastError: unknown = null;

      while (candidate) {
        const threads = threadsFor(candidate, capabilities.cores);
        // Hash scales with the build: the big net already occupies a lot, so a
        // huge table on top of it is what tips a device into an OOM.
        const hashMb = candidate.megabytes > 50 ? 128 : 64;
        try {
          const worker = await bootBuild(candidate.file, candidate.megabytes, threads, hashMb);
          activeBuild = {
            id: candidate.id, label: candidate.label,
            megabytes: candidate.megabytes, threads,
          };
          return worker;
        } catch (e) {
          lastError = e;
          markBuildFailed(candidate.id);
          candidate = fallbackAfter(candidate.id);
        }
      }
      throw lastError instanceof Error ? lastError : new Error("No se pudo cargar ningún motor");
    })();
    // A failed load must not be cached forever — let the next attempt retry.
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

/**
 * The worker to use for the next search: the current one, or a brand-new one when the last
 * search proved it dead or wedged. Terminating the old worker matters — a hung WASM instance
 * keeps its memory until it is told to go away.
 */
async function freshWorker(): Promise<Worker> {
  if (needsRestart) {
    needsRestart = false;
    const old = workerPromise;
    workerPromise = null;
    current = null;
    if (old) { try { (await old).terminate(); } catch { /* it never booted */ } }
  }
  return getWorker();
}

/** Is the engine already downloaded and handshaked? Lets the UI say so. */
export const engineReady = () => workerPromise !== null;

/** Pre-download the engine so the first analysis doesn't pay for it. */
export const warmUpEngine = () => getWorker().then(() => undefined, () => undefined);

/**
 * Runs one UCI search and resolves when the engine is idle again.
 *
 * It resolves on the engine's own `bestmove` (`finish`), on the worker dying (`onDead`), or —
 * if the soft deadline passes — after sending `stop` and either getting that `bestmove` or
 * waiting HARD_AFTER_STOP_MS more. `clean` is false when the engine never became idle, in
 * which case the worker is flagged for replacement. The result reflects whatever the search
 * had reached: callers accumulate the deepest line seen, so a stopped search returns the
 * deepest COMPLETED iteration rather than nothing.
 */
function search<T>(
  worker: Worker,
  command: string,
  softMs: number,
  onLine: (line: string, finish: () => void) => void,
  result: () => T,
): Promise<{ value: T; clean: boolean }> {
  return new Promise((resolve) => {
    let settled = false;
    let hardTimer: ReturnType<typeof setTimeout> | null = null;
    const end = (clean: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(softTimer);
      if (hardTimer) clearTimeout(hardTimer);
      current = null;
      if (!clean) needsRestart = true;
      resolve({ value: result(), clean });
    };
    const softTimer = setTimeout(() => {
      worker.postMessage("stop");
      hardTimer = setTimeout(() => end(false), HARD_AFTER_STOP_MS);
    }, softMs);
    current = { onLine: (line) => onLine(line, () => end(true)), onDead: () => end(false) };
    worker.postMessage(command);
  });
}

const depthOf = (line: string) => {
  const m = line.match(/ depth (\d+)/);
  return m ? parseInt(m[1]) : 0;
};

async function evaluateOne(fen: string, depth: number): Promise<EvalResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const worker = await freshWorker();
    let best: EvalResult | null = null;
    let bestMove: string | null = null;
    let reached = 0;
    worker.postMessage("position fen " + fen);
    await search(
      worker, `go depth ${depth}`, SOFT_EVAL_MS,
      (line, finish) => {
        if (line.startsWith("info") && line.includes("score")) {
          const parsed = parseScore(line);
          if (parsed) { best = parsed; reached = depthOf(line); }
        } else if (line.startsWith("bestmove")) {
          // Kept, not just used as an end-of-search signal: this is the same answer
          // /api/bestmove was being asked for separately, already computed here.
          const uci = line.split(/\s+/)[1];
          if (uci && uci !== "(none)") bestMove = uci;
          finish();
        }
      },
      () => null,
    );
    if (best) return { ...(best as EvalResult), bestMove, depth: reached };
    // Not one score came back: the engine is dead or wedged, and a made-up 0.00 would be
    // read as a level position. Replace it and try this position once more.
    needsRestart = true;
  }
  throw new Error("El motor dejó de responder");
}

export const evaluatePosition = (fen: string, depth = 10): Promise<EvalResult> =>
  runExclusive(() => evaluateOne(fen, depth));

export async function getTopLines(fen: string, depth = 16, multipv = 2): Promise<EngineLine[]> {
  return runExclusive(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const worker = await freshWorker();
      const lines = new Map<number, EngineLine>();
      worker.postMessage("setoption name MultiPV value " + multipv);
      worker.postMessage("position fen " + fen);
      const { value: out, clean } = await search(
        worker, `go depth ${depth}`, SOFT_LINES_MS,
        (line, finish) => {
          if (line.startsWith("info")) {
            const parsed = parseMultiPvLine(line);
            if (parsed) lines.set(parsed.index, { ...parsed.value, depth: depthOf(line) });
          } else if (line.startsWith("bestmove")) finish();
        },
        () => [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v),
      );
      // Reset so plain evaluations aren't silently running MultiPV afterwards.
      if (!needsRestart) worker.postMessage("setoption name MultiPV value 1");
      // No lines is a legitimate answer for a position with no legal move (checkmate or
      // stalemate): the engine ends cleanly with `bestmove (none)`. Only a search that never
      // finished and produced nothing means the engine is wedged.
      if (out.length > 0 || clean) return out;
      needsRestart = true;
    }
    throw new Error("El motor dejó de responder");
  });
}

export async function analyzeAllFens(
  fens: string[], depth = 10, onProgress?: (done: number, total: number) => void,
): Promise<(EvalResult | null)[]> {
  const results: (EvalResult | null)[] = [];
  for (let i = 0; i < fens.length; i++) {
    try {
      results.push(await evaluatePosition(fens[i], depth));
    } catch {
      results.push(null);
    }
    onProgress?.(i + 1, fens.length);
  }
  return results;
}

/**
 * Reset the engine between games so a re-analysis is reproducible. `ucinewgame`
 * tells Stockfish the next position is unrelated to the last; `Clear Hash` makes
 * sure nothing survives it.
 */
export async function newGame(): Promise<void> {
  return runExclusive(async () => {
    const worker = await freshWorker();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { current = null; needsRestart = true; resolve(); }, 10000);
      current = {
        onLine: (line) => {
          if (line === "readyok") { clearTimeout(timer); current = null; resolve(); }
        },
        onDead: () => { clearTimeout(timer); resolve(); },
      };
      worker.postMessage("ucinewgame");
      worker.postMessage("setoption name Clear Hash");
      worker.postMessage("isready");
    });
  });
}

export const browserEngine: CoachEngine = { newGame, evaluatePosition, getTopLines, analyzeAllFens };
