// In-process Stockfish (WASM) engine.
//
// Deploy note: we load the `lite-single` flavour of stockfish.js (~7MB, single
// threaded, no SharedArrayBuffer) directly in-process via the npm package's
// initializer. This runs inside the serverless function — NO child process is
// spawned — so it works on Vercel/Node serverless where `spawn("node", …)` does
// not. The engine instance is a module-level singleton reused across warm
// invocations, and all evaluations are serialized through a single promise chain
// because there is only one engine.

import { Chess } from "chess.js";

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

// Approximates a target ELO for "Nacimiento de un Campeón"'s play-vs-AI
// battles. Stockfish's own Skill Level / UCI_Elo floor (~1320 for UCI_Elo)
// can't reach the very low ratings this feature needs (a chapter's opening
// rival is ELO 200) — this is a deliberate, documented approximation, not a
// scientific ELO simulator.
//
// Two different regimes, on purpose:
//
// <=800 — genuinely below what Stockfish can represent at all, even at
// Skill Level 0. There's no nuanced way to make the engine itself play
// this weak, so blunderChance (an outright random legal move) is the WHOLE
// mechanism: mostly-solid engine play, occasionally interrupted by a real
// blunder. This tier is intentionally left alone here.
//
// >800 — closer to Stockfish's actual representable range, and where a
// real report came in that the ELO 950 rival "lost very easily." The old
// model still had only two states (engine's real move at depth, or a fully
// random legal move), and blunderChance compounded per ply across a game —
// the old 900-1200 tier (0.15/ply) gave a ~99% chance of at least one
// blunder and ~4 EXPECTED blunders in a 25-move game. Added a third state,
// suboptimalChance, that samples a plausible-but-not-best move from a
// MultiPV search instead of the true best move — "misjudged, not blind" —
// and brought blunderChance down so it no longer compounds to a near-
// certain pile of blunders. Only the >800 tiers changed; this is also
// exactly where the roadmap already marks the real difficulty jump
// (chapter 6, "arranca la dificultad real"), so the boundary lines up with
// the game's own existing design intent, not just this fix.
function strengthForElo(elo: number): { skillLevel: number; depth: number; blunderChance: number; suboptimalChance: number } {
  if (elo <= 300) return { skillLevel: 0, depth: 1, blunderChance: 0.9,  suboptimalChance: 0 };
  if (elo <= 600) return { skillLevel: 1, depth: 1, blunderChance: 0.6,  suboptimalChance: 0 };
  if (elo <= 800) return { skillLevel: 2, depth: 2, blunderChance: 0.35, suboptimalChance: 0 };
  if (elo <= 1200) return { skillLevel: 4,  depth: 4,  blunderChance: 0.06, suboptimalChance: 0.30 };
  if (elo <= 1600) return { skillLevel: 9,  depth: 6,  blunderChance: 0.05, suboptimalChance: 0.15 };
  if (elo <= 2000) return { skillLevel: 17, depth: 11, blunderChance: 0,    suboptimalChance: 0.08 };
  return                  { skillLevel: 20, depth: 12, blunderChance: 0,    suboptimalChance: 0 };
}

export async function getMoveAtElo(fen: string, elo: number): Promise<{ from: string; to: string; promotion?: string } | null> {
  const { skillLevel, depth, blunderChance, suboptimalChance } = strengthForElo(elo);

  if (Math.random() < blunderChance) {
    const chess = new Chess(fen);
    const legal = chess.moves({ verbose: true });
    if (legal.length > 0) {
      const m = legal[Math.floor(Math.random() * legal.length)];
      return { from: m.from, to: m.to, promotion: m.promotion };
    }
  }

  // A "reasonable but not best" tier, between the engine's true best move and
  // an outright random blunder — real sub-2000 play is mostly this, not a
  // coin flip between perfect and clueless. Sampled from a MultiPV search's
  // 2nd-4th lines rather than the top one.
  const wantsSuboptimal = suboptimalChance > 0 && Math.random() < suboptimalChance;
  const multipv = wantsSuboptimal ? 4 : 1;

  const engine = await getEngine();
  return runExclusive(() => new Promise<{ from: string; to: string; promotion?: string } | null>((resolve) => {
    let settled = false;
    const altLines = new Map<number, string>(); // multipv index -> first UCI move of its pv
    let bestUci: string | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      engine.listener = null;
      // Reset to full strength/single-line so a later full-strength call
      // (analysis, best-move lookup elsewhere) never inherits a weakened
      // or multi-line engine.
      engine.sendCommand("setoption name Skill Level value 20");
      engine.sendCommand("setoption name MultiPV value 1");

      let chosenUci = bestUci;
      if (wantsSuboptimal) {
        const alternatives = [...altLines.entries()].filter(([k]) => k > 1).map(([, v]) => v);
        if (alternatives.length > 0) {
          chosenUci = alternatives[Math.floor(Math.random() * alternatives.length)];
        }
      }

      if (!chosenUci || chosenUci === "(none)") { resolve(null); return; }
      resolve({
        from: chosenUci.slice(0, 2),
        to: chosenUci.slice(2, 4),
        promotion: chosenUci.length > 4 ? chosenUci.slice(4, 5) : undefined,
      });
    };
    // MultiPV searches take a bit longer than single-line — give them more room.
    const timer = setTimeout(finish, wantsSuboptimal ? 7000 : 4000);
    engine.listener = (line: string) => {
      if (line.startsWith("info")) {
        const mpv = line.match(/multipv (\d+)/);
        const pvm = line.match(/ pv (\S+)/);
        if (mpv && pvm) altLines.set(parseInt(mpv[1]), pvm[1]);
      } else if (line.startsWith("bestmove")) {
        bestUci = line.split(" ")[1] ?? null;
        finish();
      }
    };
    engine.sendCommand("setoption name Skill Level value " + skillLevel);
    engine.sendCommand("setoption name MultiPV value " + multipv);
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

export interface EngineLine { mate: number | null; scoreCp: number | null; pv: string[] }

// Top-N engine lines (MultiPV) for a position — the real best move + the next
// best alternatives, each with its principal variation (UCI). Deeper than the
// sweep because these feed the coach comments (quality over speed here).
export async function getTopLines(fen: string, depth = 16, multipv = 3): Promise<EngineLine[]> {
  const engine = await getEngine();
  return runExclusive(() => new Promise<EngineLine[]>((resolve) => {
    let settled = false;
    const lines = new Map<number, EngineLine>();
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      engine.listener = null;
      engine.sendCommand("setoption name MultiPV value 1"); // reset so plain evals aren't affected
      resolve([...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v));
    };
    const timer = setTimeout(finish, 13000);
    engine.listener = (line: string) => {
      if (line.startsWith("info")) {
        const mpv = line.match(/multipv (\d+)/);
        const pvm = line.match(/ pv (.+)$/);
        if (!mpv || !pvm) return;
        const k = parseInt(mpv[1]);
        const mate = line.match(/score mate (-?\d+)/);
        const cp = line.match(/score cp (-?\d+)/);
        lines.set(k, {
          mate: mate ? parseInt(mate[1]) : null,
          scoreCp: cp ? parseInt(cp[1]) : null,
          pv: pvm[1].trim().split(/\s+/).slice(0, 6),
        });
      } else if (line.startsWith("bestmove")) {
        finish();
      }
    };
    engine.sendCommand("setoption name MultiPV value " + multipv);
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
