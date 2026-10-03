import { describe, expect, it } from "vitest";
import { isValidFen, isValidUsername } from "./validate";
import { rateLimit } from "./rateLimit";

describe("isValidFen", () => {
  it("accepts the start position and rejects junk", () => {
    expect(isValidFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe(true);
    expect(isValidFen("not a fen")).toBe(false);
    expect(isValidFen("")).toBe(false);
    expect(isValidFen(42)).toBe(false);
    expect(isValidFen("x".repeat(500))).toBe(false);
  });
});

describe("isValidUsername", () => {
  it("accepts chess.com style names and rejects path tricks", () => {
    expect(isValidUsername("Magnus_Carlsen-1")).toBe(true);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("../../etc/passwd")).toBe(false);
    expect(isValidUsername("a b c")).toBe(false);
    expect(isValidUsername("x".repeat(26))).toBe(false);
  });
});

describe("rateLimit", () => {
  const req = (ip: string) => new Request("http://localhost/api/x", { headers: { "x-forwarded-for": ip } });
  it("allows up to max calls per window, then answers 429 with Retry-After", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit(req("1.1.1.1"), "t-a", 3, 60_000)).toBeNull();
    const blocked = rateLimit(req("1.1.1.1"), "t-a", 3, 60_000);
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
  it("counts clients and routes separately", () => {
    for (let i = 0; i < 2; i++) rateLimit(req("2.2.2.2"), "t-b", 2, 60_000);
    expect(rateLimit(req("2.2.2.2"), "t-b", 2, 60_000)?.status).toBe(429);
    expect(rateLimit(req("3.3.3.3"), "t-b", 2, 60_000)).toBeNull();
    expect(rateLimit(req("2.2.2.2"), "t-c", 2, 60_000)).toBeNull();
  });
});
