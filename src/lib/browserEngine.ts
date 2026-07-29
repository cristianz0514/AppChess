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

import {
  type CoachEngine, type EngineLine, type EvalResult,
  parseScore, parseMultiPvLine,
} from "./engineApi";

const ENGINE_URL = "/engine/stockfish-18-lite-single.js";

interface Pending { onLine: (line: string) => void }

let workerPromise: Promise<Worker> | null = null;
let chain: Promise<unknown> = Promise.resolve();
let current: Pending | null = null;

/** Serialises every search: there is one engine, and UCI is a single conversation. */
function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  // Keep the chain alive after a rejection so one failed search doesn't wedge
  // every later one.
  chain = next.then(() => undefined, () => undefined);
  return next;
}

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = new Worker(ENGINE_URL);
      worker.onmessage = (e: MessageEvent) => {
        const line = typeof e.data === "string" ? e.data : "";
        if (line) current?.onLine(line);
      };

      await new Promise<void>((resolve, reject) => {
        // The .wasm is 7MB. On a cold cache over a slow connection this is the
        // one genuinely slow step in the whole flow, so it gets a long fuse and
        // a real error rather than a silent hang.
        const timer = setTimeout(() => reject(new Error("El motor tardó demasiado en cargar")), 60000);
        current = {
          onLine: (line) => {
            if (line === "readyok") { clearTimeout(timer); current = null; resolve(); }
          },
        };
        worker.postMessage("uci");
        worker.postMessage("setoption name Threads value 1");
        // 64MB of hash, against 16 on the server. A bigger table means fewer
        // repeated searches; we can afford it here because we're not sharing
        // 512MB with the whole web app.
        worker.postMessage("setoption name Hash value 64");
        worker.postMessage("isready");
      });

      return worker;
    })();
    // A failed load must not be cached forever — let the next attempt retry.
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

/** Is the engine already downloaded and handshaked? Lets the UI say so. */
export const engineReady = () => workerPromise !== null;

/** Pre-download the engine so the first analysis doesn't pay for it. */
export const warmUpEngine = () => getWorker().then(() => undefined, () => undefined);

function search<T>(
  worker: Worker,
  command: string,
  timeoutMs: number,
  onLine: (line: string, finish: () => void) => void,
  result: () => T,
): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      current = null;
      resolve(result());
    };
    // A deadline costs DEPTH, not the result: callers accumulate the deepest
    // line seen so far, so cutting a search short returns the shallowest
    // completed iteration instead of nothing.
    const timer = setTimeout(finish, timeoutMs);
    current = { onLine: (line) => onLine(line, finish) };
    worker.postMessage(command);
  });
}

async function evaluateOne(fen: string, depth: number): Promise<EvalResult> {
  const worker = await getWorker();
  let best: EvalResult = { score: 0, mate: null };
  worker.postMessage("position fen " + fen);
  return search(
    worker, `go depth ${depth}`, 10000,
    (line, finish) => {
      if (line.startsWith("info") && line.includes("score")) {
        const parsed = parseScore(line);
        if (parsed) best = parsed;
      } else if (line.startsWith("bestmove")) finish();
    },
    () => best,
  );
}

export const evaluatePosition = (fen: string, depth = 10): Promise<EvalResult> =>
  runExclusive(() => evaluateOne(fen, depth));

export async function getTopLines(fen: string, depth = 16, multipv = 2): Promise<EngineLine[]> {
  return runExclusive(async () => {
    const worker = await getWorker();
    const lines = new Map<number, EngineLine>();
    worker.postMessage("setoption name MultiPV value " + multipv);
    worker.postMessage("position fen " + fen);
    const out = await search(
      worker, `go depth ${depth}`, 25000,
      (line, finish) => {
        if (line.startsWith("info")) {
          const parsed = parseMultiPvLine(line);
          if (parsed) lines.set(parsed.index, parsed.value);
        } else if (line.startsWith("bestmove")) finish();
      },
      () => [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v),
    );
    // Reset so plain evaluations aren't silently running MultiPV afterwards.
    worker.postMessage("setoption name MultiPV value 1");
    return out;
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

export const browserEngine: CoachEngine = { evaluatePosition, getTopLines, analyzeAllFens };
