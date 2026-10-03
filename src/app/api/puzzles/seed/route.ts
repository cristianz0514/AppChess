import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { seedLichessPuzzles, PuzzlesSchemaMissingError } from "@/services/puzzles";
import { FULL_TARGET, MATE_LEVELS, type MateIn } from "@/lib/puzzleConstants";
import { rateLimit } from "@/lib/rateLimit";

// Seeds ONE level up to a given count. Called both for the fast initial batch
// (small count, blocks the UI briefly) and for background continuation calls
// (larger count, fire-and-forget from the client) — see BackgroundSeeder.
// Idempotent: only fetches as many NEW puzzles as needed to reach the target.
export async function POST(req: NextRequest) {
  // Triggers outbound Lichess downloads and database writes, so it needs a
  // session and a brake — it used to be open to anyone.
  const cookieStore = await cookies();
  if (!cookieStore.get("bv_username")?.value) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  const limited = rateLimit(req, "puzzles-seed", 20, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const mateIn: MateIn = MATE_LEVELS.includes(body.mateIn) ? body.mateIn : 1;
  const count = typeof body.count === "number" ? Math.min(body.count, FULL_TARGET[mateIn]) : FULL_TARGET[mateIn];

  try {
    const result = await seedLichessPuzzles(mateIn, count);
    return NextResponse.json({ mateIn, ...result });
  } catch (err) {
    if (err instanceof PuzzlesSchemaMissingError) {
      return NextResponse.json({ error: err.message, code: "SCHEMA_MISSING" }, { status: 409 });
    }
    console.error("[puzzles/seed]", err);
    return NextResponse.json({ error: "No se pudieron cargar los ejercicios" }, { status: 500 });
  }
}
