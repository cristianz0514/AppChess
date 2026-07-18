import { supabase } from "@/lib/supabase";

export type ChapterResult = "win" | "loss" | "draw";

export interface ChapterCompletion {
  championId: string;
  chapterId: string;
  result: ChapterResult;
  completedAt: string;
}

// Keyed by "{championId}/{chapterId}" for O(1) lookups from the UI (e.g.
// "did the player already beat this chapter?").
export async function getChampionProgress(userId: string): Promise<Map<string, ChapterCompletion>> {
  const { data } = await supabase
    .from("champion_progress")
    .select("champion_id, chapter_id, result, completed_at")
    .eq("user_id", userId);

  const map = new Map<string, ChapterCompletion>();
  for (const row of data ?? []) {
    map.set(`${row.champion_id}/${row.chapter_id}`, {
      championId: row.champion_id,
      chapterId: row.chapter_id,
      result: row.result as ChapterResult,
      completedAt: row.completed_at,
    });
  }
  return map;
}

// Saves whenever the player reaches the end of a chapter, whatever the
// result — upserted so a later retry (e.g. losing, then coming back and
// winning) overwrites the stored result instead of erroring on the unique
// constraint or leaving a stale "loss" on record after a win.
export async function saveChapterResult(
  userId: string, championId: string, chapterId: string, result: ChapterResult,
): Promise<void> {
  // The Supabase client returns a {data, error} pair instead of throwing —
  // an unchecked `.error` (as this was) silently drops the write on a real
  // failure (e.g. an RLS policy rejecting the upsert) while the caller sees
  // a normal resolved promise and reports success anyway. Surfacing it here
  // is what turns that into a real, callable-visible failure.
  const { error } = await supabase.from("champion_progress").upsert(
    { user_id: userId, champion_id: championId, chapter_id: chapterId, result, completed_at: new Date().toISOString() },
    { onConflict: "user_id,champion_id,chapter_id" },
  );
  if (error) throw new Error(`saveChapterResult: ${error.message}`);
}
