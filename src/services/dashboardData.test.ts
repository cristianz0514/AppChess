import { describe, it, expect, vi, beforeEach } from "vitest";

// A stand-in for the `moves` and `games` tables that behaves like PostgREST: filters by `in`/`eq`,
// orders by id and answers at most the rows of the requested range (never more than 1000 anyway).
type Row = { id: string; game_id: string; move_number: number; classification: string | null; ply?: number | null };
let table: Row[] = [];
let gameIds: string[] = [];
let requests = 0;

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (name: string) => {
      if (name === "games") {
        const g = {
          select: () => g, eq: () => g, not: () => g, order: () => g,
          limit: () => Promise.resolve({ data: gameIds.map((id) => ({ id })), error: null }),
        };
        return g;
      }
      let rows = table;
      const q = {
        select: () => q,
        in: (col: keyof Row, values: string[]) => { rows = rows.filter((r) => values.includes(String(r[col]))); return q; },
        eq: (col: keyof Row, value: unknown) => { rows = rows.filter((r) => r[col] === value); return q; },
        order: () => { rows = [...rows].sort((a, b) => a.id.localeCompare(b.id)); return q; },
        limit: () => Promise.resolve({ data: [], error: null }), // the `ply` column probe
        range: (from: number, to: number) => {
          requests++;
          return Promise.resolve({ data: rows.slice(from, Math.min(to, from + 999) + 1), error: null });
        },
      };
      return q;
    },
  },
}));

import { getMovesOfGames, getUnanalyzedGameIds } from "./dashboardData";

const games = (n: number) => Array.from({ length: n }, (_, i) => `g${String(i).padStart(3, "0")}`);
const fill = (ids: string[], perGame: number) => {
  table = ids.flatMap((g) => Array.from({ length: perGame }, (_, i) => ({
    id: `${g}-${String(i).padStart(3, "0")}`, game_id: g, move_number: Math.floor(i / 2) + 1,
    classification: i % 5 === 0 ? "blunder" : "good",
  })));
};

describe("reading the moves of many games", () => {
  beforeEach(() => { table = []; requests = 0; });

  it("returns every row, not just the first thousand", async () => {
    const ids = games(50);
    fill(ids, 80); // 4000 rows: a single query would have answered 1000
    const rows = await getMovesOfGames<Row>(ids, "game_id, move_number");
    expect(rows.length).toBe(4000);
    expect(new Set(rows.map((r) => r.game_id)).size).toBe(50);
  });

  it("splits a long list of games into several requests and reads each chunk to the end", async () => {
    const ids = games(250);
    fill(ids, 25); // 6250 rows over 3 chunks of up to 100 games
    const rows = await getMovesOfGames<Row>(ids, "game_id");
    expect(rows.length).toBe(6250);
    expect(new Set(rows.map((r) => r.id)).size).toBe(6250); // no row twice at a page boundary
    expect(requests).toBeGreaterThan(3);
  });

  it("applies the classification and move-number filters", async () => {
    const ids = games(10);
    fill(ids, 20);
    const errors = await getMovesOfGames<Row>(ids, "game_id", { classes: ["blunder"] });
    expect(errors.length).toBe(40); // rows 0,5,10,15 of each game
    const first = await getMovesOfGames<Row>(ids, "game_id", { moveNumber: 1 });
    expect(first.length).toBe(20);
  });

  it("lists as pending the games with no moves and the ones analysed before `ply` existed", async () => {
    gameIds = ["modern", "legacy", "never"];
    table = [
      { id: "m0", game_id: "modern", move_number: 1, classification: "best", ply: 0 },
      { id: "m1", game_id: "modern", move_number: 1, classification: "good", ply: 1 },
      { id: "l0", game_id: "legacy", move_number: 1, classification: "best", ply: null },
      { id: "l1", game_id: "legacy", move_number: 1, classification: "good", ply: null },
    ];
    expect(await getUnanalyzedGameIds("u", 50)).toEqual(["legacy", "never"]);
  });

  it("answers an empty list of games without asking anything", async () => {
    expect(await getMovesOfGames<Row>([], "game_id")).toEqual([]);
    expect(requests).toBe(0);
  });
});
