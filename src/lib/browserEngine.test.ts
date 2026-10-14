import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// A scripted stand-in for the Stockfish Web Worker. The behaviour on `go` is set per test, so
// each failure mode of the real engine can be reproduced exactly: a slow search that has to be
// stopped, a worker that never answers, a worker that crashes.
type Go = (w: FakeWorker, fen: string) => void;

class FakeWorker {
  static instances: FakeWorker[] = [];
  static onGo: Go = () => {};
  static onStop: (w: FakeWorker) => void = () => {};
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  terminated = false;
  fen = "";
  commands: string[] = [];
  constructor(public url: string) { FakeWorker.instances.push(this); }
  emit(line: string) { this.onmessage?.({ data: line }); }
  postMessage(cmd: string) {
    this.commands.push(cmd);
    queueMicrotask(() => {
      if (this.terminated) return;
      if (cmd === "isready") this.emit("readyok");
      else if (cmd.startsWith("position fen ")) this.fen = cmd.slice("position fen ".length);
      else if (cmd.startsWith("go ")) FakeWorker.onGo(this, this.fen);
      else if (cmd === "stop") FakeWorker.onStop(this);
    });
  }
  terminate() { this.terminated = true; }
}

const finishedSearch = (w: FakeWorker, cp: number, depth = 16, move = "e2e4") => {
  w.emit(`info depth ${depth} multipv 1 score cp ${cp} nodes 1 pv ${move} e7e5`);
  w.emit(`bestmove ${move}`);
};

async function load() {
  vi.resetModules();
  vi.doMock("./engineBuild", () => ({
    chooseBuild: () => ({ build: { id: "lite-st", file: "fake.js", megabytes: 7, threaded: false, label: "ligero" }, capabilities: { cores: 4 } }),
    fallbackAfter: () => null,
    markBuildFailed: () => {},
    threadsFor: () => 1,
  }));
  return await import("./browserEngine");
}

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.onGo = () => {};
  FakeWorker.onStop = () => {};
  (globalThis as unknown as { Worker: unknown }).Worker = FakeWorker;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("./engineBuild");
});

describe("browser engine", () => {
  it("returns the score, the best move and the depth it actually reached", async () => {
    FakeWorker.onGo = (w) => finishedSearch(w, 35, 16);
    const eng = await load();
    const r = await eng.evaluatePosition("fenA", 16);
    expect(r.score).toBeCloseTo(0.35);
    expect(r.bestMove).toBe("e2e4");
    expect(r.depth).toBe(16);
  });

  it("a search at its deadline is STOPPED and drained, and cannot leak into the next position", async () => {
    // First position: the engine reports depth 6 and keeps thinking. Second position: normal.
    let calls = 0;
    FakeWorker.onGo = (w) => {
      calls++;
      if (calls === 1) w.emit("info depth 6 multipv 1 score cp 50 nodes 1 pv d2d4");
      else finishedSearch(w, -120, 16, "g1f3");
    };
    // The engine answers `stop` with its bestmove a moment later, like the real one.
    FakeWorker.onStop = (w) => w.emit("bestmove d2d4");
    const eng = await load();

    const first = eng.evaluatePosition("fenA", 16);
    await vi.advanceTimersByTimeAsync(eng.SOFT_EVAL_MS + 10);
    const r1 = await first;
    expect(FakeWorker.instances[0].commands).toContain("stop");
    expect(r1.score).toBeCloseTo(0.5);
    expect(r1.depth).toBe(6);                 // the caller can SEE it was cut short

    const r2 = await eng.evaluatePosition("fenB", 16);
    expect(r2.score).toBeCloseTo(-1.2);       // its own score, not the first search's
    expect(r2.bestMove).toBe("g1f3");
    expect(FakeWorker.instances.length).toBe(1);   // a clean stop needs no new worker
  });

  it("a wedged engine is replaced and the position retried, instead of reporting 0.00", async () => {
    FakeWorker.onGo = (w) => {
      if (FakeWorker.instances.indexOf(w) === 0) return;       // the first worker never answers
      finishedSearch(w, 80, 16);
    };
    const eng = await load();
    const p = eng.evaluatePosition("fenA", 16);
    await vi.advanceTimersByTimeAsync(eng.SOFT_EVAL_MS + eng.HARD_AFTER_STOP_MS + 50);
    const r = await p;
    expect(r.score).toBeCloseTo(0.8);
    expect(FakeWorker.instances.length).toBe(2);
    expect(FakeWorker.instances[0].terminated).toBe(true);
  });

  it("a worker that dies mid-search is replaced at once", async () => {
    FakeWorker.onGo = (w) => {
      if (FakeWorker.instances.indexOf(w) === 0) { w.onerror?.({ message: "memory access out of bounds" }); return; }
      finishedSearch(w, -40, 16);
    };
    const eng = await load();
    const r = await eng.evaluatePosition("fenA", 16);
    expect(r.score).toBeCloseTo(-0.4);
    expect(FakeWorker.instances.length).toBe(2);
  });

  it("gives up with an error — never a fake score — when no engine will answer", async () => {
    FakeWorker.onGo = () => {};
    const eng = await load();
    const p = eng.evaluatePosition("fenA", 16);
    const assertion = expect(p).rejects.toThrow("dejó de responder");
    await vi.advanceTimersByTimeAsync((eng.SOFT_EVAL_MS + eng.HARD_AFTER_STOP_MS + 50) * 2);
    await assertion;
  });

  it("analyzeAllFens turns an unanswerable position into a missing evaluation, not a level one", async () => {
    let n = 0;
    FakeWorker.onGo = (w) => { n++; if (n <= 2) return; finishedSearch(w, 10, 16); };   // two silent attempts
    const eng = await load();
    const p = eng.analyzeAllFens(["fenA", "fenB"], 16);
    await vi.advanceTimersByTimeAsync((eng.SOFT_EVAL_MS + eng.HARD_AFTER_STOP_MS + 50) * 2);
    const out = await p;
    expect(out[0]).toBeNull();
    expect(out[1]?.score).toBeCloseTo(0.1);
  });

  it("a position with no legal move is an empty answer, not a dead engine", async () => {
    FakeWorker.onGo = (w) => { w.emit("info depth 0 score mate 0"); w.emit("bestmove (none)"); };
    const eng = await load();
    expect(await eng.getTopLines("matedFen", 16, 2)).toEqual([]);
    const r = await eng.evaluatePosition("matedFen", 16);
    expect(r.mate).toBe(0);
    expect(FakeWorker.instances.length).toBe(1);     // nobody restarted the engine for it
  });

  it("MultiPV lines carry the depth they reached", async () => {
    FakeWorker.onGo = (w) => {
      w.emit("info depth 15 multipv 1 score cp 20 pv e2e4 e7e5");
      w.emit("info depth 16 multipv 1 score cp 25 pv e2e4 e7e5");
      w.emit("info depth 16 multipv 2 score cp 10 pv d2d4 d7d5");
      w.emit("bestmove e2e4");
    };
    const eng = await load();
    const lines = await eng.getTopLines("fenA", 16, 2);
    expect(lines.map((l) => l.depth)).toEqual([16, 16]);
    expect(lines[0].scoreCp).toBe(25);
  });
});
