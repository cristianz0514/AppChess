import { describe, it, expect, vi } from "vitest";
import { Chess } from "chess.js";

// The detector imports the database client at module load; the facts tested here are pure.
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { exchangeAwareVerdict, tradeVerdictFor } from "./blunderDetector";

function play(sans: string[]) {
  const c = new Chess();
  const history: { captured?: string; to: string; piece: string }[] = [];
  const fens: string[] = [];
  for (const san of sans) {
    const m = c.move(san);
    history.push({ captured: m.captured, to: m.to, piece: m.piece });
    fens.push(c.fen());
  }
  return { history, fens };
}

describe("exchangeAwareVerdict", () => {
  // 1.d4 d5 2.Nc3 e6 3.Nf3 Bd6 4.e4 dxe4 5.Nxe4 Nf6 6.Bg5 Be7 7.Bd3 Nxe4 8.Bxe7 Qxe7 9.Bxe4
  const line = ["d4", "d5", "Nc3", "e6", "Nf3", "Bd6", "e4", "dxe4", "Nxe4", "Nf6", "Bg5", "Be7", "Bd3", "Nxe4", "Bxe7", "Qxe7", "Bxe4"];

  it("a capture that merely closes an exchange does not 'win material'", () => {
    const { history, fens } = play(line);
    const i = line.length - 1;                                   // 9.Bxe4
    // SEE alone sees a knight taken with no recapture on e4: a clean win.
    expect(tradeVerdictFor(fens[i], history[i])).toBe("gana");
    // Across the whole chain — N for N, B for B — the material is level.
    expect(exchangeAwareVerdict(history, fens, i, "w", "gana")).toBe("pareja");
  });

  it("keeps 'gana' when the chain really does win something", () => {
    // 1.e4 d5 2.exd5 Qxd5 3.Nc3 Qxg2?? is not it; use a plain free piece after a trade.
    // 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Bxc6 dxc6 5.Nxe5 — white wins a pawn at the end of a trade.
    const seq = ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Bxc6", "dxc6", "Nxe5"];
    const { history, fens } = play(seq);
    const i = seq.length - 1;
    expect(exchangeAwareVerdict(history, fens, i, "w", "gana")).toBe("gana");
  });

  it("sees through a quiet move between the two halves of a trade", () => {
    // 1.e4 d5 2.exd5 Nf6 3.Nc3 Nxd5: black retakes the pawn two moves later — a trade, not a win.
    const seq = ["e4", "d5", "exd5", "Nf6", "Nc3", "Nxd5"];
    const { history, fens } = play(seq);
    expect(tradeVerdictFor(fens[5], history[5])).toBe("gana");
    expect(exchangeAwareVerdict(history, fens, 5, "b", "gana")).toBe("pareja");
  });

  it("leaves a first capture alone", () => {
    const seq = ["e4", "d5", "exd5"];
    const { history, fens } = play(seq);
    expect(exchangeAwareVerdict(history, fens, 2, "w", "gana")).toBe("gana");
  });

  it("never upgrades a verdict", () => {
    const { history, fens } = play(line);
    expect(exchangeAwareVerdict(history, fens, line.length - 1, "w", "pareja")).toBe("pareja");
    expect(exchangeAwareVerdict(history, fens, line.length - 1, "w", "pierde")).toBe("pierde");
    expect(exchangeAwareVerdict(history, fens, line.length - 1, "w", null)).toBeNull();
  });
});
