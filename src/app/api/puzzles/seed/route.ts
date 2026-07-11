import { NextResponse } from "next/server";
import { seedLichessPuzzles } from "@/services/puzzles";

// Seeds the fixed, numbered Lichess batch for both levels. Idempotent — only
// fetches as many NEW puzzles as needed to reach the target count, so it's
// safe to call this on every visit to the practice page.
export async function POST() {
  try {
    const [mate1, mate2] = await Promise.all([
      seedLichessPuzzles(1, 20),
      seedLichessPuzzles(2, 15),
    ]);
    return NextResponse.json({ mate1, mate2 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "seed failed" }, { status: 500 });
  }
}
