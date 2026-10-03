import { describe, expect, it } from "vitest";
import { classifyWinLoss, isBrilliantSacrifice } from "./moveClassification";
import { winPercent } from "./accuracy";

// Win-probability lost by a move, from the mover's side, given before/after evals in pawns.
const lost = (before: number, after: number) => Math.max(0, winPercent(before * 100) - winPercent(after * 100));

describe("classifyWinLoss — reference cases from real games", () => {
  it.each([
    [11.6, 8.9, "excellent"], // was wrongly "blunder" on raw centipawns
    [0.0, -0.1, "best"],
    [0.0, -0.5, "inaccuracy"],
    [0.2, -2.0, "blunder"],
    [3.0, 0.2, "blunder"],
    [0.5, -3.2, "blunder"],
  ])("%f -> %f is %s", (before, after, expected) => {
    expect(classifyWinLoss(lost(before, after))).toBe(expected);
  });
  it("is ordered by severity at the band edges", () => {
    expect(classifyWinLoss(0.99)).toBe("best");
    expect(classifyWinLoss(1)).toBe("excellent");
    expect(classifyWinLoss(2)).toBe("good");
    expect(classifyWinLoss(4)).toBe("inaccuracy");
    expect(classifyWinLoss(8)).toBe("mistake");
    expect(classifyWinLoss(18)).toBe("blunder");
  });
});

describe("isBrilliantSacrifice", () => {
  it("does NOT flag an even trade: bishop takes knight, pawn recaptures", () => {
    expect(isBrilliantSacrifice({ movedValue: 3, capturedValue: 3, evalBefore: 0.2, recapturerValues: [1] })).toBe(false);
  });
  it("does NOT flag a piece trade for a rook-for-rook exchange either", () => {
    expect(isBrilliantSacrifice({ movedValue: 5, capturedValue: 5, evalBefore: 0, recapturerValues: [1] })).toBe(false);
  });
  it("flags a real sacrifice: bishop takes a pawn and can only be recaptured by a pawn", () => {
    expect(isBrilliantSacrifice({ movedValue: 3, capturedValue: 1, evalBefore: 0.1, recapturerValues: [1] })).toBe(true);
  });
  it("flags a piece placed en prise for nothing", () => {
    expect(isBrilliantSacrifice({ movedValue: 3, capturedValue: 0, evalBefore: 0, recapturerValues: [1] })).toBe(true);
  });
  it("flags the classic exchange sacrifice (rook for a knight)", () => {
    expect(isBrilliantSacrifice({ movedValue: 5, capturedValue: 3, evalBefore: 0, recapturerValues: [3] })).toBe(true);
  });
  it("ignores pawn moves, safe squares and already-crushing positions", () => {
    expect(isBrilliantSacrifice({ movedValue: 1, capturedValue: 0, evalBefore: 0, recapturerValues: [1] })).toBe(false);
    expect(isBrilliantSacrifice({ movedValue: 3, capturedValue: 0, evalBefore: 0, recapturerValues: [] })).toBe(false);
    expect(isBrilliantSacrifice({ movedValue: 3, capturedValue: 0, evalBefore: 6, recapturerValues: [1] })).toBe(false);
  });
});
