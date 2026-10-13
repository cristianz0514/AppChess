import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal chainable stand-in for the Supabase client: users lookups, a games
// count, and no-op writes. `state` is what the test wants the database to hold.
const state = { userId: null as string | null, games: 0, inserted: [] as unknown[] };

vi.mock("@/lib/supabase", () => {
  const builder = (table: string) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = vi.fn((_c?: string, opts?: { head?: boolean }) => { (q as { _head?: boolean })._head = !!opts?.head; return q; });
    q.eq = self; q.range = vi.fn(() => Promise.resolve({ data: [], error: null }));
    q.maybeSingle = () => Promise.resolve({ data: table === "users" && state.userId ? { id: state.userId } : null, error: null });
    q.single = () => Promise.resolve({ data: { id: "new-user" }, error: null });
    q.insert = (row: unknown) => { state.inserted.push({ table, row }); return q; };
    q.upsert = () => Promise.resolve({ error: null });
    q.then = (res: (v: unknown) => unknown) => res({ count: table === "games" ? state.games : 0, data: [], error: null });
    return q;
  };
  return { supabase: { from: (t: string) => builder(t) } };
});

const chess = vi.hoisted(() => ({
  validateUsername: vi.fn(),
  fetchAllGames: vi.fn(),
  fetchRecentMonths: vi.fn(),
}));
vi.mock("./chesscom", async (orig) => ({ ...(await orig<typeof import("./chesscom")>()), ...chess }));

import { importGames } from "./gameImport";
import { ChessComUnavailableError } from "./chesscom";

beforeEach(() => {
  state.userId = null; state.games = 0; state.inserted = [];
  chess.validateUsername.mockReset(); chess.fetchAllGames.mockReset(); chess.fetchRecentMonths.mockReset();
  chess.fetchAllGames.mockResolvedValue([]); chess.fetchRecentMonths.mockResolvedValue([]);
});

describe("importGames — returning user (already has stored games)", () => {
  beforeEach(() => { state.userId = "u1"; state.games = 10064; });

  it("opens the account with stored data when chess.com is unavailable (no error)", async () => {
    chess.validateUsername.mockResolvedValue("unavailable");
    const r = await importGames("cristianz05");
    expect(r).toEqual({ imported: 0, userId: "u1", stale: true });
    expect(chess.fetchAllGames).not.toHaveBeenCalled();
  });
  it("still opens it if chess.com says the name no longer exists", async () => {
    chess.validateUsername.mockResolvedValue("not_found");
    const r = await importGames("cristianz05");
    expect(r.userId).toBe("u1");
  });
  it("refreshes only the recent months, never the full history", async () => {
    chess.validateUsername.mockResolvedValue("ok");
    await importGames("cristianz05");
    expect(chess.fetchRecentMonths).toHaveBeenCalledWith("cristianz05", 3);
    expect(chess.fetchAllGames).not.toHaveBeenCalled();
  });
});

describe("importGames — new user", () => {
  it("cannot be created while chess.com is unavailable (nothing to show yet)", async () => {
    chess.validateUsername.mockResolvedValue("unavailable");
    await expect(importGames("nuevo")).rejects.toBeInstanceOf(ChessComUnavailableError);
    expect(state.inserted).toHaveLength(0);
  });
  it("is rejected with the 'not found' message on a real 404", async () => {
    chess.validateUsername.mockResolvedValue("not_found");
    await expect(importGames("nadie")).rejects.toThrow(/No encontramos ese usuario/);
  });
  it("gets the full history and a profile when chess.com answers", async () => {
    chess.validateUsername.mockResolvedValue("ok");
    await importGames("nuevo");
    expect(chess.fetchAllGames).toHaveBeenCalled();
    expect(state.inserted).toHaveLength(1);
  });
});

describe("importGames — profile with no games yet (a failed first import)", () => {
  it("downloads the full history again", async () => {
    state.userId = "u2"; state.games = 0;
    chess.validateUsername.mockResolvedValue("ok");
    await importGames("vacio");
    expect(chess.fetchAllGames).toHaveBeenCalled();
    expect(chess.fetchRecentMonths).not.toHaveBeenCalled();
  });
  it("is not let in as 'stale' when chess.com is down (there is nothing stored)", async () => {
    state.userId = "u2"; state.games = 0;
    chess.validateUsername.mockResolvedValue("unavailable");
    await expect(importGames("vacio")).rejects.toBeInstanceOf(ChessComUnavailableError);
  });
});
