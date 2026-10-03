import { afterEach, describe, expect, it, vi } from "vitest";
import { ChessComUnavailableError, chessFetch, fetchAllGames, validateUsername } from "./chesscom";

const res = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

// Retries sleep 0.7s/1.4s; fake timers keep the tests instant.
async function run<T>(p: Promise<T>): Promise<T> {
  vi.useFakeTimers();
  // Settle first, rethrow after the timers are drained, so a rejection is never
  // left unobserved while the fake clock advances.
  const settled = p.then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, e }));
  await vi.runAllTimersAsync();
  const r = await settled;
  if (!r.ok) throw r.e;
  return r.v;
}

describe("validateUsername", () => {
  it("ok on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(200)));
    expect(await validateUsername("cristianz05")).toBe("ok");
  });
  it("not_found only on a real 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(404)));
    expect(await validateUsername("nadie")).toBe("not_found");
  });
  it("unavailable (not 'user not found') when chess.com blocks or rate-limits", async () => {
    for (const status of [403, 429, 503]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(status)));
      expect(await run(validateUsername("cristianz05"))).toBe("unavailable");
    }
  });
  it("unavailable when the network itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    expect(await run(validateUsername("cristianz05"))).toBe("unavailable");
  });
  it("recovers when a temporary 429 clears on retry", async () => {
    const f = vi.fn().mockResolvedValueOnce(res(429)).mockResolvedValueOnce(res(200));
    vi.stubGlobal("fetch", f);
    expect(await run(validateUsername("cristianz05"))).toBe("ok");
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe("chessFetch", () => {
  it("does not retry a normal answer", async () => {
    const f = vi.fn().mockResolvedValue(res(404));
    vi.stubGlobal("fetch", f);
    await chessFetch("https://api.chess.com/pub/player/x");
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("fetchAllGames", () => {
  it("returns [] for an account with no archives (404)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(404)));
    expect(await fetchAllGames("vacio")).toEqual([]);
  });
  it("throws instead of importing a partial history when a month keeps failing", async () => {
    const f = vi.fn((url: string) =>
      Promise.resolve(url.endsWith("/archives")
        ? res(200, { archives: ["https://api.chess.com/pub/player/u/games/2024/01", "https://api.chess.com/pub/player/u/games/2024/02"] })
        : url.endsWith("2024/02") ? res(429) : res(200, { games: [] })));
    vi.stubGlobal("fetch", f);
    await expect(run(fetchAllGames("u"))).rejects.toBeInstanceOf(ChessComUnavailableError);
  });
});
