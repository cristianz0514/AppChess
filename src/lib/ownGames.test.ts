import { describe, it, expect } from "vitest";
import { isChampionBattle, isOwnPly, ownRows } from "./ownGames";

describe("own half-moves", () => {
  it("White owns the even plies, Black the odd ones", () => {
    expect([0, 1, 2, 3].map((p) => isOwnPly(p, "white"))).toEqual([true, false, true, false]);
    expect([0, 1, 2, 3].map((p) => isOwnPly(p, "black"))).toEqual([false, true, false, true]);
  });

  it("keeps only the player's rows, and keeps rows analysed before `ply` existed", () => {
    const rows = [{ ply: 0, id: "a" }, { ply: 1, id: "b" }, { ply: 2, id: "c" }, { ply: null, id: "legacy" }, { id: "none" }];
    expect(ownRows(rows, "white").map((r) => r.id)).toEqual(["a", "c", "legacy", "none"]);
    expect(ownRows(rows, "black").map((r) => r.id)).toEqual(["b", "legacy", "none"]);
  });
});

describe("champion battles", () => {
  it("are told apart by their synthetic id", () => {
    expect(isChampionBattle("campeones-fischer-1-u-123")).toBe(true);
    expect(isChampionBattle("123456789")).toBe(false);
    expect(isChampionBattle(null)).toBe(false);
  });
});
