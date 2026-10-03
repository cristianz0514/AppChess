import { describe, expect, it } from "vitest";
import { averageCentipawnLoss, gameAccuracy, moveAccuracy, sideAccuracy, winPercent } from "./accuracy";

describe("winPercent", () => {
  it("is 50% at equality and symmetric", () => {
    expect(winPercent(0)).toBeCloseTo(50, 5);
    expect(winPercent(300) + winPercent(-300)).toBeCloseTo(100, 5);
  });
  it("grows with the evaluation and saturates at +-1000cp", () => {
    expect(winPercent(100)).toBeGreaterThan(winPercent(0));
    expect(winPercent(5000)).toBeCloseTo(winPercent(1000), 8);
  });
});

describe("moveAccuracy", () => {
  it("is ~100 when nothing is lost and 0..100 always", () => {
    expect(moveAccuracy(60, 60)).toBeCloseTo(100, 0);
    expect(moveAccuracy(60, 70)).toBeCloseTo(100, 0); // gaining never penalises
    for (const lost of [0, 5, 20, 60, 100]) {
      const a = moveAccuracy(100, 100 - lost);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(100);
    }
  });
  it("drops as more win probability is given away", () => {
    expect(moveAccuracy(50, 40)).toBeLessThan(moveAccuracy(50, 48));
  });
});

describe("gameAccuracy", () => {
  it("returns null for no moves and the value for a perfect game", () => {
    expect(gameAccuracy([])).toBeNull();
    expect(gameAccuracy([100, 100, 100])).toBe(100);
  });
  it("one blunder lowers it but does not zero it", () => {
    const g = gameAccuracy([100, 100, 100, 5]);
    expect(g).not.toBeNull();
    expect(g!).toBeLessThan(100);
    expect(g!).toBeGreaterThan(40);
  });
});

describe("averageCentipawnLoss", () => {
  it("is null for no moves and caps each move at 300", () => {
    expect(averageCentipawnLoss([])).toBeNull();
    expect(averageCentipawnLoss([2000, 0])).toBe(150);
  });
});

describe("sideAccuracy", () => {
  // White-perspective evals in pawns after each ply: white blunders on ply 2.
  const evals = [0.3, 0.2, -3.0, -3.1];
  const losses = [0, 0, 320, 0];
  it("counts only the requested side's moves", () => {
    expect(sideAccuracy(evals, losses, "white").moves).toBe(2);
    expect(sideAccuracy(evals, losses, "black").moves).toBe(2);
  });
  it("grades the side that blundered lower, not the opponent", () => {
    const white = sideAccuracy(evals, losses, "white");
    const black = sideAccuracy(evals, losses, "black");
    expect(white.accuracy!).toBeLessThan(black.accuracy!);
  });
  it("skips plies without an evaluation", () => {
    expect(sideAccuracy([null, null], [null, null], "white").accuracy).toBeNull();
  });
});
