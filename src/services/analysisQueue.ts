import { analyzeGame } from "./blunderDetector";
import { generateInsights } from "./insightsGenerator";
import { getUnanalyzedGameIds } from "./dashboardData";
import { supabase } from "@/lib/supabase";

// Server-side background analysis queue.
//
// Render runs a single long-lived Node process, so a module-level worker keeps
// analyzing games even after the client navigates away or closes the tab. The
// client just POSTs to start and polls GET for progress. Deep analysis is slow,
// so this avoids making the user babysit the page.
//
// Caveats (acceptable for this app's scale): state is per-process (one Render
// instance) and pauses if the free tier spins down while idle — on-open
// analysis covers anything the batch didn't reach.

interface BatchState {
  running: boolean;
  total: number;
  done: number;
  userId: string | null;
  startedAt: number | null;
}

let state: BatchState = { running: false, total: 0, done: 0, userId: null, startedAt: null };

export function getBatchStatus(): BatchState {
  return { ...state };
}

export function stopBatch(): void {
  state.running = false;
}

export async function startBatch(userId: string): Promise<{ started: boolean; total: number }> {
  if (state.running) return { started: false, total: state.total };

  const pending = await getUnanalyzedGameIds(userId, 50);
  state = { running: true, total: pending.length, done: 0, userId, startedAt: Date.now() };

  if (pending.length === 0) {
    state.running = false;
    return { started: true, total: 0 };
  }

  // Fire-and-forget worker — NOT awaited, so the POST returns immediately.
  void (async () => {
    for (const id of pending) {
      if (!state.running) break;
      const { data: game } = await supabase.from("games").select("id, pgn").eq("id", id).single();
      if (game) {
        try { await analyzeGame(game.id, game.pgn); } catch { /* skip failing game */ }
      }
      state.done++;
    }
    try { await generateInsights(userId); } catch { /* non-fatal */ }
    state.running = false;
  })();

  return { started: true, total: pending.length };
}
