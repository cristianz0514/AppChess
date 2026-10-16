import { describe, it, expect } from "vitest";
import { isChampionBattle, isOwnPly, ownRows } from "./ownGames";

describe("own half-moves", () => {
  it("White owns the even plies, Black the odd ones", () => {
    expect([0, 1, 2, 3].map((p) => isOwnPly(p, "white"))).toEqual([true, false, true, false]);
    expect([0, 1, 2, 3].map((p) => isOwnPly(p, "black"))).toEqual([false, true, false, true]);
  });

  it("keeps only the player's rows", () => {
    const rows = [{ ply: 0, id: "a" }, { ply: 1, id: "b" }, { ply: 2, id: "c" }];
    expect(ownRows(rows, "white").map((r) => r.id)).toEqual(["a", "c"]);
    expect(ownRows(rows, "black").map((r) => r.id)).toEqual(["b"]);
  });

  it("does not attribute a row analysed before `ply` existed: its side cannot be told", () => {
    const rows = [{ ply: 0, id: "a" }, { ply: null, id: "legacy" }];
    expect(ownRows(rows, "white").map((r) => r.id)).toEqual(["a"]);
    expect(ownRows(rows, "black").map((r) => r.id)).toEqual([]);
  });

  it("keeps every row when the database has no `ply` column at all", () => {
    const rows: { id: string; ply?: number | null }[] = [{ id: "x" }, { id: "y" }];
    expect(ownRows(rows, "white").length).toBe(2);
  });
});

describe("champion battles", () => {
  it("are told apart by their synthetic id", () => {
    expect(isChampionBattle("campeones-fischer-1-u-123")).toBe(true);
    expect(isChampionBattle("123456789")).toBe(false);
    expect(isChampionBattle(null)).toBe(false);
  });
});
