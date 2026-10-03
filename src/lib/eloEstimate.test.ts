import { describe, expect, it } from "vitest";
import { acplForElo, estimateEloFromAcpl } from "./eloEstimate";

describe("estimateEloFromAcpl", () => {
  it("reproduces the published reference points", () => {
    expect(estimateEloFromAcpl(34)).toBe(2210);
    expect(estimateEloFromAcpl(54)).toBe(1810);
    expect(estimateEloFromAcpl(95)).toBe(1200);
    expect(estimateEloFromAcpl(100)).toBe(1140);
  });
  it("is clamped: a near-perfect game never reads above 2400, a terrible one never below 400", () => {
    expect(estimateEloFromAcpl(0)).toBe(2400);
    expect(estimateEloFromAcpl(5)).toBe(2400);
    expect(estimateEloFromAcpl(900)).toBe(400);
  });
  it("never increases as ACPL grows", () => {
    let prev = Infinity;
    for (let acpl = 0; acpl <= 400; acpl += 10) {
      const elo = estimateEloFromAcpl(acpl);
      expect(elo).toBeLessThanOrEqual(prev);
      prev = elo;
    }
  });
});

describe("acplForElo", () => {
  it("is null for no moves, a plain mean otherwise, capped at 2000 per move", () => {
    expect(acplForElo([])).toBeNull();
    expect(acplForElo([10, 30])).toBe(20);
    expect(acplForElo([5000, 0])).toBe(1000);
  });
});
