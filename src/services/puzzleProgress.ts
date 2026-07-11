import { supabase } from "@/lib/supabase";

export interface RoadTripNode {
  id: string;
  mateIn: 1 | 2;
  orderIndex: number;
  fen: string;
  solution: string[];
  personal: boolean;
  gameId: string | null;
  state: "locked" | "current" | "done";
}

export interface RoadTripWorld {
  mateIn: 1 | 2;
  title: string;
  subtitle: string;
  nodes: RoadTripNode[];
  solvedCount: number;
  locked: boolean; // whole world locked until the previous one is fully solved
}

const WORLD_META: Record<1 | 2, { title: string; subtitle: string }> = {
  1: { title: "Mate en 1", subtitle: "Encuentra la jugada que da jaque mate de inmediato." },
  2: { title: "Mate en 2", subtitle: "Dos jugadas tuyas, con una respuesta forzada del rival." },
};

// Builds the full road trip for a player: puzzles ordered per level, with
// per-user progress applied — the first unsolved node is "current", everything
// after it is "locked", and a whole world is locked until the previous one is
// 100% solved (Mate en 2 unlocks only after all of Mate en 1 is done).
export async function getRoadTrip(userId: string): Promise<RoadTripWorld[]> {
  const [puzzlesRes, progressRes] = await Promise.all([
    supabase
      .from("puzzles")
      .select("id, mate_in, order_index, fen, solution, source, game_id, user_id")
      .or(`source.eq.lichess,user_id.eq.${userId}`)
      .order("mate_in", { ascending: true })
      .order("order_index", { ascending: true }),
    supabase
      .from("puzzle_progress")
      .select("puzzle_id, solved")
      .eq("user_id", userId),
  ]);
  const { data: puzzles } = puzzlesRes;
  const { data: progress } = progressRes;

  const solvedSet = new Set((progress ?? []).filter((p) => p.solved).map((p) => p.puzzle_id));

  const levels: (1 | 2)[] = [1, 2];
  const worlds: RoadTripWorld[] = [];
  let previousWorldFullySolved: boolean = true;

  for (const mateIn of levels) {
    const rows = (puzzles ?? []).filter((p) => p.mate_in === mateIn);
    const worldLocked: boolean = !previousWorldFullySolved;

    let currentAssigned = false;
    const nodes: RoadTripNode[] = rows.map((p) => {
      const solved = solvedSet.has(p.id);
      let state: RoadTripNode["state"] = "locked";
      if (worldLocked) {
        state = "locked";
      } else if (solved) {
        state = "done";
      } else if (!currentAssigned) {
        state = "current";
        currentAssigned = true;
      } else {
        state = "locked";
      }
      return {
        id: p.id,
        mateIn,
        orderIndex: p.order_index,
        fen: p.fen,
        solution: p.solution as string[],
        personal: p.source === "user_game",
        gameId: p.game_id,
        state,
      };
    });

    const solvedCount = nodes.filter((n) => n.state === "done").length;
    worlds.push({
      mateIn,
      title: WORLD_META[mateIn].title,
      subtitle: WORLD_META[mateIn].subtitle,
      nodes,
      solvedCount,
      locked: worldLocked,
    });

    previousWorldFullySolved = !worldLocked && rows.length > 0 && solvedCount === rows.length;
  }

  return worlds;
}

// Records an attempt. On success, marks the puzzle solved (idempotent — safe
// to call again if the user revisits a completed node).
export async function recordPuzzleAttempt(userId: string, puzzleId: string, solved: boolean): Promise<void> {
  const { data: existing } = await supabase
    .from("puzzle_progress")
    .select("attempts, solved")
    .eq("user_id", userId)
    .eq("puzzle_id", puzzleId)
    .maybeSingle();

  const attempts = (existing?.attempts ?? 0) + 1;
  const nowSolved = existing?.solved || solved;

  await supabase.from("puzzle_progress").upsert(
    {
      user_id: userId,
      puzzle_id: puzzleId,
      attempts,
      solved: nowSolved,
      solved_at: nowSolved ? new Date().toISOString() : null,
    },
    { onConflict: "user_id,puzzle_id" },
  );
}
