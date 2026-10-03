import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { isBookMove, isBookPosition } from "./openingBook";

function fenAfter(sans: string[]): string {
  const c = new Chess();
  for (const s of sans) c.move(s);
  return c.fen();
}

describe("isBookMove (exact move order)", () => {
  it("accepts every ply of a mainline Ruy Lopez", () => {
    const line = ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"];
    line.forEach((_, i) => expect(isBookMove(line, i)).toBe(true));
  });
  it("stops being book once a line deviates", () => {
    const line = ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Qh5"];
    expect(isBookMove(line, 5)).toBe(true);
    expect(isBookMove(line, 6)).toBe(false);
  });
  it("is false for out-of-range plies", () => {
    expect(isBookMove(["e4"], -1)).toBe(false);
    expect(isBookMove(["e4"], 5)).toBe(false);
  });
});

describe("isBookPosition (transposition-aware)", () => {
  it("recognises a known opening position", () => {
    expect(isBookPosition(fenAfter(["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"]))).toBe(true);
  });
  it("treats different move orders reaching the same position alike", () => {
    const a = fenAfter(["d4", "Nf6", "c4", "e6", "Nc3"]);
    const b = fenAfter(["c4", "e6", "Nc3", "Nf6", "d4"]);
    expect(isBookPosition(a)).toBe(isBookPosition(b));
  });
  it("ignores the move counters in the FEN", () => {
    const fen = fenAfter(["e4", "e5", "Nf3"]);
    const parts = fen.split(" ");
    const shifted = [...parts.slice(0, 4), "7", "42"].join(" ");
    expect(isBookPosition(shifted)).toBe(isBookPosition(fen));
  });
  it("is false for a sparse endgame, null and undefined", () => {
    expect(isBookPosition("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1")).toBe(false);
    expect(isBookPosition(null)).toBe(false);
    expect(isBookPosition(undefined)).toBe(false);
  });
});
