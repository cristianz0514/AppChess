import { describe, it, expect, vi } from "vitest";

// The module reads Supabase on import of dashboardData; the pure parts under test do not need it.
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { computeFacts, parsePgnClocks, timePressurePlies, type PlayerSnapshot } from "./insightsGenerator";

describe("clocks in the PGN", () => {
  it("reads whole seconds and tenths, so every ply keeps its place", () => {
    const pgn = "1. e4 {[%clk 0:03:00]} 1... e5 {[%clk 0:03:00.5]} 2. Nf3 {[%clk 0:02:58.7]} 2... Nc6 {[%clk 0:00:09.5]}";
    expect(parsePgnClocks(pgn)).toEqual([180, 180.5, 178.7, 9.5]);
  });

  it("counts only the player's own clock as the player's time pressure", () => {
    // Ply 0,2 are White's; ply 1,3 Black's. Black is the one down to 9 seconds.
    const clocks = [60, 60, 50, 9];
    expect([...timePressurePlies(clocks, "white")]).toEqual([]);
    expect([...timePressurePlies(clocks, "black")]).toEqual([3]);
  });
});

// A snapshot with nothing in it, to be filled in per test.
const snapshot = (over: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  totalGames: 10, analyzedGames: 10, winrate: 50, avgAccuracy: 70,
  topOpenings: [], worstOpenings: [], earlyQueenGames: 0, lowDevelopmentGames: 0,
  hasClockData: false, timePressureGames: 0, timePressureBlunders: 0, totalBlundersInTimeGames: 0,
  blundersByPhase: { opening: 0, middlegame: 0, endgame: 0 },
  severeBlunders: 0, totalBlunders: 0, totalMistakes: 0, peakBlunderMoveRange: null, hungPieces: [],
  behind: {
    info: {
      g1: { opening: "Sicilian Defense", result: "loss" },
      g2: { opening: "Italian Game", result: "win" },
      g3: { opening: "Sicilian Defense", result: "loss" },
    },
    analyzed: ["g1", "g2", "g3"],
    errors: { g1: 3, g2: 0, g3: 1 },
    earlyQueen: [], lowDevelopment: [], timePressure: [], hung: [],
    phase: { opening: [], middlegame: [], endgame: [] },
    peak: [], severe: [], openingGames: {},
  },
  ...over,
});

describe("the related games of a notice", () => {
  it("are the games the figure was counted from, biggest contribution first", () => {
    const s = snapshot({
      hasClockData: true, timePressureBlunders: 5, totalBlundersInTimeGames: 8,
      behind: { ...snapshot().behind, timePressure: [{ id: "g3", count: 1 }, { id: "g1", count: 4 }] },
    });
    const [fact] = computeFacts(s);
    expect(fact.category).toBe("time_management");
    expect(fact.message).toContain("63%");
    expect(fact.games.map((g) => [g.id, g.detail])).toEqual([
      ["g1", "4 errores con poco tiempo"],
      ["g3", "1 error con poco tiempo"],
    ]);
  });

  it("for the weakest opening are the games played with it, lost ones first, with their own errors", () => {
    const s = snapshot({
      worstOpenings: [{ name: "Defensa Siciliana", raw: "Sicilian Defense", games: 4, winrate: 25 }],
      behind: { ...snapshot().behind, openingGames: { "Sicilian Defense": ["g2", "g3", "g1"] } },
    });
    const [fact] = computeFacts(s);
    expect(fact.category).toBe("opening");
    // g2 was won, so it goes after the two lost games, which keep their order.
    expect(fact.games.map((g) => [g.id, g.detail])).toEqual([["g3", "1 error"], ["g1", "3 errores"], ["g2", "0 errores"]]);
  });

  it("says a game was not analysed instead of claiming it had no errors", () => {
    const s = snapshot({
      worstOpenings: [{ name: "Defensa Siciliana", raw: "Sicilian Defense", games: 4, winrate: 25 }],
      behind: { ...snapshot().behind, analyzed: ["g1"], openingGames: { "Sicilian Defense": ["g3", "g1"] } },
    });
    expect(computeFacts(s)[0].games.map((g) => [g.id, g.detail])).toEqual([["g3", "sin analizar"], ["g1", "3 errores"]]);
  });

  it("never lists a game that is not in the snapshot", () => {
    const s = snapshot({
      severeBlunders: 3,
      behind: { ...snapshot().behind, severe: [{ id: "gone", count: 3 }, { id: "g2", count: 1 }] },
    });
    expect(computeFacts(s)[0].games.map((g) => g.id)).toEqual(["g2"]);
  });

  it("an early queen is listed earliest first, naming the move", () => {
    const s = snapshot({
      earlyQueenGames: 4,
      behind: { ...snapshot().behind, earlyQueen: [{ id: "g1", count: 4 }, { id: "g2", count: 2 }] },
    });
    expect(computeFacts(s)[0].games.map((g) => g.detail)).toEqual(["dama en la jugada 2", "dama en la jugada 4"]);
  });

  it("the per-game habits are judged against the analysed games", () => {
    // 5 early-queen games out of 40 analysed is 12%: under the 15% bar, though it is over the floor of 4.
    expect(computeFacts(snapshot({ totalGames: 10, analyzedGames: 40, earlyQueenGames: 5 }))).toEqual([]);
    expect(computeFacts(snapshot({ totalGames: 10, analyzedGames: 20, earlyQueenGames: 4 })).length).toBe(1);
  });
});
