import { NextRequest, NextResponse } from "next/server";
import { saveChapterResult, type ChapterResult } from "@/services/championProgress";

const VALID_RESULTS: ChapterResult[] = ["win", "loss", "draw"];

// Saves the player's progress once they reach the end of a chapter (the
// "done" screen) — whatever the result, so the road ahead knows this
// chapter has been attempted, and a later win overwrites an earlier loss.
export async function POST(req: NextRequest) {
  const { userId, championId, chapterId, result } = await req.json().catch(() => ({}));
  if (!userId || !championId || !chapterId || !VALID_RESULTS.includes(result)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  try {
    await saveChapterResult(userId, championId, chapterId, result);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "No se pudo guardar el progreso" }, { status: 500 });
  }
}
