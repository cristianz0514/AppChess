// In-process Stockfish (WASM) engine.
//
// Deploy note: we load the `lite-single` flavour of stockfish.js (~7MB, single
// threaded, no SharedArrayBuffer) directly in-process via the npm package's
// initializer. This runs inside the serverless function — NO child process is
// spawned — so it works on Vercel/Node serverless where `spawn("node", …)` does
// not. The engine instance is a module-level singleton reused across warm
// invocations, and all evaluations are serialized through a single promise chain
// because there is only one engine.

interface EvalResult {
  score: number;      // pawns, side-to-move perspective; ±9999 = mate
  mate: number | null;
}

interface StockfishEngine {
  sendCommand: (cmd: string) => void;
  listener: ((line: string) => void) | null;
  terminate?: () => void;
}

let enginePromise: Promise<StockfishEngine> | null = null;

// Stockfish's emscripten glue assigns `fetch=null` to the global scope when it
// loads (it uses fs, not fetch). On a long-lived Node server this nukes the
// global fetch for the WHOLE process, breaking every later chess.com import
// ("fetch is not a function"). Capture the native fetch now and restore it
// after the engine initializes.
const nativeFetch = globalThis.fetch;

async function getEngine(): Promise<StockfishEngine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      // stockfish is a CommonJS package with no types; default export is the initializer.
      const mod = (await import("stockfish")) as unknown as {
        default?: (path?: string) => Promise<StockfishEngine>;
      };
      const initEngine = (mod.default ?? (mod as unknown)) as (path?: string) => Promise<StockfishEngine>;

      const engine = await initEngine("lite-single");

      // Restore the global fetch that stockfish nulled out.
      if (typeof globalThis.fetch !== "function" && typeof nativeFetch === "function") {
        globalThis.fetch = nativeFetch;
      }

      // Wait for a clean ready handshake before the first evaluation.
      await new Promise<void>((resolve) => {
        engine.listener = (line: string) => {
          if (line === "readyok") resolve();
        };
        engine.sendCommand("uci");
        engine.sendCommand("setoption name Threads value 1");
        engine.sendCommand("setoption name Hash value 16");
        engine.sendCommand("isready");
      });
      engine.listener = null;
      return engine;
    })().catch((err) => {
      enginePromise = null; // allow retry on a later request if init failed
      throw err;
    });
  }
  return enginePromise;
}

// Serialize all engine access: there is a single engine instance shared across
// concurrent requests, so evaluations must not interleave.
let chain: Promise<unknown> = Promise.resolve();
let engineBusy = false;

export function isEngineBusy(): boolean { return engineBusy; }

function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const result = chain.then(task, task);
  chain = result.catch(() => {});
  return result;
}

function evaluateOne(engine: StockfishEngine, fen: string, depth: number): Promise<EvalResult> {
  return new Promise((resolve) => {
    let best: EvalResult = { score: 0, mate: null };
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      engine.listener = null;
      resolve(best);
    };

    const timer = setTimeout(finish, 2500);

    engine.listener = (line: string) => {
      if (typeof line !== "string") return;
      if (line.startsWith("info") && line.includes("score")) {
        // Keep the deepest score line seen before bestmove.
        const mateMatch = line.match(/score mate (-?\d+)/);
        const cpMatch   = line.match(/score cp (-?\d+)/);
        if (mateMatch) {
          // Encode distance-to-mate in the score: |score| = 10000 − N, so the UI
          // can show "mate in N". Sign = side-to-move perspective.
          const n = parseInt(mateMatch[1]);
          const mag = 10000 - Math.min(Math.abs(n), 99);
          best = { score: (n >= 0 ? mag : -mag), mate: n };
        } else if (cpMatch) {
          best = { score: parseInt(cpMatch[1]) / 100, mate: null };
        }
      } else if (line.startsWith("bestmove")) {
        finish();
      }
    };

    engine.sendCommand("position fen " + fen);
    engine.sendCommand("go depth " + depth);
  });
}

// Evaluates a single FEN position.
export async function evaluatePosition(fen: string, depth = 10): Promise<EvalResult> {
  const engine = await getEngine();
  return runExclusive(() => evaluateOne(engine, fen, depth));
}

// Returns the best move for a position as { from, to } squares.
export async function getBestMove(fen: string, depth = 12): Promise<{ from: string; to: string } | null> {
  const engine = await getEngine();
  return runExclusive(() => new Promise<{ from: string; to: string } | null>((resolve) => {
    let settled = false;
    const finish = (uciMove: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      engine.listener = null;
      if (!uciMove || uciMove === "(none)") { resolve(null); return; }
      resolve({ from: uciMove.slice(0, 2), to: uciMove.slice(2, 4) });
    };
    const timer = setTimeout(() => finish(null), 4000);
    engine.listener = (line: string) => {
      if (line.startsWith("bestmove")) finish(line.split(" ")[1] ?? null);
    };
    engine.sendCommand("position fen " + fen);
    engine.sendCommand("go depth " + depth);
  }));
}

// Returns the engine's principal variation (best line) as UCI moves — the real
// continuation, so a coach comment can be grounded in what actually happens.
export async function getPrincipalVariation(fen: string, depth = 14, maxPlies = 6): Promise<string[]> {
  const engine = await getEngine();
  return runExclusive(() => new Promise<string[]>((resolve) => {
    let settled = false;
    let pv: string[] = [];
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      engine.listener = null;
      resolve(pv);
    };
    const timer = setTimeout(finish, 4500);
    engine.listener = (line: string) => {
      if (line.startsWith("info")) {
        const m = line.match(/ pv (.+)$/);
        if (m) pv = m[1].trim().split(/\s+/).slice(0, maxPlies);
      } else if (line.startsWith("bestmove")) {
        finish();
      }
    };
    engine.sendCommand("position fen " + fen);
    engine.sendCommand("go depth " + depth);
  }));
}

// Evaluates multiple FENs sequentially on the shared engine.
export async function analyzeAllFens(
  fens: string[],
  depth = 10,
  onProgress?: (done: number, total: number) => void
): Promise<(EvalResult | null)[]> {
  if (fens.length === 0) return [];
  const engine = await getEngine();
  const results: (EvalResult | null)[] = [];

  engineBusy = true;
  try {
    for (let i = 0; i < fens.length; i++) {
      try {
        const r = await runExclusive(() => evaluateOne(engine, fens[i], depth));
        results.push(r);
      } catch {
        results.push(null);
      }
      onProgress?.(i + 1, fens.length);
      // Yield to the event loop between searches so the server stays responsive
      // (single-CPU free tier — otherwise sustained analysis blocks HTTP → 502).
      await new Promise((r) => setTimeout(r, 15));
    }
  } finally {
    engineBusy = false;
  }

  return results;
}
