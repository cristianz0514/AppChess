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

  // Once the gate is acquired, EVERY path out must release it — otherwise a
  // thrown DB fetch (or a stream that never starts) would leak the lock and
  // block all future analysis until the process restarts. The stream's own
  // finally handles the happy path; this try/catch covers the fetch and any
  // error before the stream is handed back.
  let game: { id: string; pgn: string } | null = null;
  try {
    const { data } = await supabase
      .from("games")
      .select("id, pgn")
      .eq("id", gameId)
      .single();
    game = data;
  } catch {
    endAnalysis();
    return new Response(JSON.stringify({ error: "Analysis failed" }), { status: 500 });
  }

  if (!game) {
    endAnalysis();
    return new Response(JSON.stringify({ error: "Game not found" }), { status: 404 });
  }

  const theGame = game;
  // Stream progress via newline-delimited JSON so the client can show a progress bar.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      try {
        await analyzeGame(theGame.id, theGame.pgn, (done, total, label) => {
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
