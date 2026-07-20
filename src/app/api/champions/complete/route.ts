import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserId } from "@/services/dashboardData";
import { saveChapterResult, type ChapterResult } from "@/services/championProgress";

const VALID_RESULTS: ChapterResult[] = ["win", "loss", "draw"];

// Saves the player's progress once they reach the end of a chapter (the
// "done" screen) — whatever the result, so the road ahead knows this
// chapter has been attempted, and a later win overwrites an earlier loss.
export async function POST(req: NextRequest) {
  // Derive the user from the session cookie, never a client-supplied userId —
  // otherwise any caller could write progress into another account by passing
  // its id. Matches how /api/puzzles/attempt already does it.
  const cookieStore = await cookies();
  const username = cookieStore.get("bv_username")?.value;
  if (!username) return NextResponse.json({ error: "No session" }, { status: 401 });
  const userId = await getUserId(decodeURIComponent(username).toLowerCase());
  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { championId, chapterId, result } = await req.json().catch(() => ({}));
  if (!championId || !chapterId || !VALID_RESULTS.includes(result)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  try {
    await saveChapterResult(userId, championId, chapterId, result);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "No se pudo guardar el progreso" }, { status: 500 });
  }
}
