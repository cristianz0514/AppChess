import { describe, it, expect } from "vitest";
import {
  acplForElo, estimateEloFromAcpl, estimateElo,
  MIN_MOVES_FOR_ELO, LOSS_CAP, ELO_FLOOR, ELO_CEILING,
} from "./eloEstimate";

describe("estimateEloFromAcpl", () => {
  it("is clamped to the range the measurement can support", () => {
    expect(estimateEloFromAcpl(0)).toBeLessThanOrEqual(ELO_CEILING);
    expect(estimateEloFromAcpl(5)).toBeLessThanOrEqual(ELO_CEILING);
    expect(estimateEloFromAcpl(900)).toBe(ELO_FLOOR);
  });

  it("is monotonic: a higher average loss never gives a higher Elo", () => {
    let prev = Infinity;
    for (let acpl = 0; acpl <= 400; acpl += 5) {
      const elo = estimateEloFromAcpl(acpl);
      expect(elo).toBeLessThanOrEqual(prev);
      prev = elo;
    }
  });

  it("is gentle where the published curve was not: a clean game no longer reads as a master", () => {
    // The published 3100·e^(−0.01·ACPL) gave 2400 at ACPL 20 and ~420 at ACPL 200 — the whole
    // scale for one player's good and bad afternoon. The calibrated curve stays inside a
    // believable band for the same two games.
    expect(estimateEloFromAcpl(20)).toBeLessThan(2300);
    // The average loss measured for real ~1000-rated players is in the 70-110 range; they must
    // read as club-level, not as a master and not at the floor.
    const typical = estimateEloFromAcpl(85);
    expect(typical).toBeGreaterThan(700);
    expect(typical).toBeLessThan(1500);
  });
});

describe("acplForElo", () => {
  it("is null for no moves", () => {
    expect(acplForElo([])).toBeNull();
  });

  it("caps each move's loss so one catastrophe cannot define the player", () => {
    expect(acplForElo([10, 30])).toBe(20);
    expect(acplForElo([5000, 0])).toBe(LOSS_CAP / 2);
  });

  it("ignores negative noise instead of rewarding it", () => {
    expect(acplForElo([-50, 50])).toBe(25);
  });
});

describe("estimateElo", () => {
  const moves = (n: number, loss: number) => Array.from({ length: n }, () => loss);

  it("says nothing from too few moves", () => {
    expect(estimateElo(moves(MIN_MOVES_FOR_ELO - 1, 30))).toBeNull();
    expect(estimateElo(moves(MIN_MOVES_FOR_ELO, 30))).not.toBeNull();
  });

  it("always comes with a range that contains the guess", () => {
    for (const loss of [0, 15, 40, 80, 150, 300]) {
      const e = estimateElo(moves(30, loss))!;
      expect(e.low).toBeLessThanOrEqual(e.elo);
      expect(e.high).toBeGreaterThanOrEqual(e.elo);
      expect(e.low).toBeGreaterThanOrEqual(ELO_FLOOR);
    }
  });

  it("the range is wide enough to be honest: a single game is not precise", () => {
    const e = estimateElo(moves(30, 60))!;
    expect(e.high - e.low).toBeGreaterThanOrEqual(300);
  });

  it("a flawless game does not read as a master: one game cannot say that", () => {
    expect(estimateElo(moves(30, 0))!.elo).toBeLessThan(2000);
  });

  it("a ~1000 player's typical game reads as roughly their level", () => {
    // The sample's average loss for 900-1200 rated players is about 70-100 centipawns.
    const e = estimateElo(moves(30, 85))!;
    expect(e.elo).toBeGreaterThan(900);
    expect(e.elo).toBeLessThan(1250);
    expect(e.low).toBeLessThanOrEqual(1043);
    expect(e.high).toBeGreaterThanOrEqual(1043);
  });

  it("a worse game never reads higher than a better one", () => {
    const better = estimateElo(moves(30, 25))!.elo;
    const worse = estimateElo(moves(30, 90))!.elo;
    expect(worse).toBeLessThan(better);
  });
});
