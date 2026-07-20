import { NextRequest } from "next/server";
import { analyzeGame } from "@/services/blunderDetector";
import { tryBeginAnalysis, endAnalysis } from "@/services/stockfish";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { gameId, force } = await req.json().catch(() => ({}));

  if (!gameId || typeof gameId !== "string") {
    return new Response(JSON.stringify({ error: "gameId required" }), { status: 400 });
  }

  // If the game already has analyzed moves, skip Stockfish entirely — unless
  // `force` is set (used to regenerate the AI coach comments for older games).
  if (!force) {
    const { count } = await supabase
      .from("moves")
      .select("id", { count: "exact", head: true })
      .eq("game_id", gameId);

    if (count && count > 0) {
      return new Response(JSON.stringify({ done: 1, total: 1, finished: true }), { status: 200 });
    }
  }

  // If another full game analysis is already running, tell the client to
  // retry. This gate covers the WHOLE analyzeGame (not just the shallow sweep),
  // so two interactive analyses can't overlap and OOM the free-tier instance.
  // Atomic check-and-set — safe to acquire here before the async DB fetch.
  if (!tryBeginAnalysis()) {
    return new Response(JSON.stringify({ busy: true }), { status: 503 });
  }

  const { data: game } = await supabase
    .from("games")
    .select("id, pgn")
    .eq("id", gameId)
    .single();

  if (!game) {
    endAnalysis();
    return new Response(JSON.stringify({ error: "Game not found" }), { status: 404 });
  }

  // Stream progress via newline-delimited JSON so the client can show a progress bar.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      try {
        await analyzeGame(game.id, game.pgn, (done, total, label) => {
          send({ done, total, label });
        });
        send({ done: 1, total: 1, finished: true });
      } catch (err) {
        send({ error: err instanceof Error ? err.message : "Analysis failed" });
      } finally {
        endAnalysis();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
