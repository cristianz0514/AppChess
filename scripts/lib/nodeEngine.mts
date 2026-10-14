// A CoachEngine backed by a real Stockfish process, for running the app's own analysis
// pipeline (analyzeGame) outside the browser — measurement harnesses, calibration runs.
//
// It speaks the same UCI the browser worker does and reuses the app's own parsers
// (parseScore / parseMultiPvLine), so what it returns has the same shape and scale as
// production. Differences from browserEngine.ts, deliberately:
//   - the deadline is generous (default 5 min per search): a measurement run must reach
//     the requested depth every time, whereas the browser caps searches (10 s per
//     position) to stay responsive and accepts a shallower answer. Capped depth in the
//     browser is a source of drift between devices; here it must not be.
//   - each call records the depth the search actually reached, so a run can prove it.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseScore, parseMultiPvLine, parsePv, type CoachEngine, type EvalResult, type EngineLine } from "@/lib/engineApi";

const ENGINE = fileURLToPath(new URL("../../node_modules/stockfish/bin/stockfish-18-lite-single.js", import.meta.url));

export interface NodeEngine extends CoachEngine {
  close(): void;
  /** Depth actually reached by every search so far — the minimum tells whether any was cut short. */
  depthsReached: number[];
}

export function createNodeEngine(opts: { hashMb?: number; searchTimeoutMs?: number } = {}): NodeEngine {
  const hashMb = opts.hashMb ?? 64;
  const timeoutMs = opts.searchTimeoutMs ?? 300_000;
  const depthsReached: number[] = [];
  const proc: ChildProcessWithoutNullStreams = spawn(process.execPath, [ENGINE], { stdio: ["pipe", "pipe", "pipe"] });
  let handler: ((line: string) => void) | null = null;
  let carry = "";
  proc.stdout.on("data", (d: Buffer) => {
    carry += d.toString();
    const parts = carry.split("\n");
    carry = parts.pop() ?? "";
    for (const l of parts) handler?.(l.trim());
  });
  proc.stderr.on("data", (d: Buffer) => process.stderr.write("[engine] " + d));
  const send = (s: string) => proc.stdin.write(s + "\n");

  let chain: Promise<unknown> = Promise.resolve();
  const exclusive = <T,>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.then(() => undefined, () => undefined);
    return next;
  };

  const wait = (cmds: string[], until: (l: string) => boolean, onLine?: (l: string) => void): Promise<void> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => { handler = null; reject(new Error("engine timeout")); }, timeoutMs);
      handler = (l) => { onLine?.(l); if (until(l)) { clearTimeout(timer); handler = null; resolve(); } };
      for (const c of cmds) send(c);
    });

  let ready: Promise<void> | null = null;
  const boot = () => (ready ??= wait(["uci"], (l) => l === "uciok")
    .then(() => wait([`setoption name Hash value ${hashMb}`, "isready"], (l) => l === "readyok")));

  const depthOf = (l: string) => { const m = l.match(/ depth (\d+)/); return m ? parseInt(m[1]) : 0; };

  async function evaluateOne(fen: string, depth: number): Promise<EvalResult> {
    await boot();
    let best: EvalResult = { score: 0, mate: null };
    let bestMove: string | null = null;
    let reached = 0;
    let pv: string[] | undefined;
    await wait([`position fen ${fen}`, `go depth ${depth}`], (l) => l.startsWith("bestmove"), (l) => {
      if (l.startsWith("info") && l.includes("score")) {
        const p = parseScore(l);
        if (p) { best = p; reached = depthOf(l); const v = parsePv(l); if (v) pv = v; }
      } else if (l.startsWith("bestmove")) {
        const u = l.split(/\s+/)[1];
        if (u && u !== "(none)") bestMove = u;
      }
    });
    depthsReached.push(reached);
    return { ...best, bestMove, ...(pv ? { pv } : {}) };
  }

  async function topLines(fen: string, depth: number, multipv: number): Promise<EngineLine[]> {
    await boot();
    const lines = new Map<number, EngineLine>();
    let reached = 0;
    await wait([`setoption name MultiPV value ${multipv}`, `position fen ${fen}`, `go depth ${depth}`], (l) => l.startsWith("bestmove"), (l) => {
      if (l.startsWith("info")) {
        const p = parseMultiPvLine(l);
        if (p) { lines.set(p.index, p.value); reached = Math.max(reached, depthOf(l)); }
      }
    });
    send("setoption name MultiPV value 1");
    depthsReached.push(reached);
    return [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  }

  return {
    depthsReached,
    close: () => { try { send("quit"); } catch { /* already gone */ } proc.kill(); },
    newGame: () => exclusive(async () => {
      await boot();
      await wait(["ucinewgame", "setoption name Clear Hash", "isready"], (l) => l === "readyok");
    }),
    evaluatePosition: (fen, depth = 16) => exclusive(() => evaluateOne(fen, depth)),
    getTopLines: (fen, depth = 16, multipv = 2) => exclusive(() => topLines(fen, depth, multipv)),
    analyzeAllFens: async (fens, depth = 16, onProgress) => {
      const out: (EvalResult | null)[] = [];
      for (let i = 0; i < fens.length; i++) {
        try { out.push(await exclusive(() => evaluateOne(fens[i], depth))); } catch { out.push(null); }
        onProgress?.(i + 1, fens.length);
      }
      return out;
    },
  };
}
