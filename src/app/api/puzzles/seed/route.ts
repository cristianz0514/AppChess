import { NextRequest, NextResponse } from "next/server";
import { seedLichessPuzzles, PuzzlesSchemaMissingError } from "@/services/puzzles";
import { FULL_TARGET } from "@/lib/puzzleConstants";

// Seeds ONE level up to a given count. Called both for the fast initial batch
// (small count, blocks the UI briefly) and for background continuation calls
// (larger count, fire-and-forget from the client) — see BackgroundSeeder.
// Idempotent: only fetches as many NEW puzzles as needed to reach the target.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const mateIn = body.mateIn === 2 ? 2 : 1;
  const count = typeof body.count === "number" ? Math.min(body.count, FULL_TARGET[mateIn]) : FULL_TARGET[mateIn];

  try {
    const result = await seedLichessPuzzles(mateIn as 1 | 2, count);
    return NextResponse.json({ mateIn, ...result });
  } catch (err) {
    if (err instanceof PuzzlesSchemaMissingError) {
      return NextResponse.json({ error: err.message, code: "SCHEMA_MISSING" }, { status: 409 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "seed failed" }, { status: 500 });
  }
}
