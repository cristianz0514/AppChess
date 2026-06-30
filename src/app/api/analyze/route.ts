import { NextRequest } from "next/server";
import { analyzeGame } from "@/services/blunderDetector";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { gameId } = await req.json().catch(() => ({}));

  if (!gameId || typeof gameId !== "string") {
    return new Response(JSON.stringify({ error: "gameId required" }), { status: 400 });
  }

  const { data: game } = await supabase
    .from("games")
    .select("id, pgn")
    .eq("id", gameId)
    .single();

  if (!game) {
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
        await analyzeGame(game.id, game.pgn, (done, total) => {
          send({ done, total });
        });
        send({ done: 1, total: 1, finished: true });
      } catch (err) {
        send({ error: err instanceof Error ? err.message : "Analysis failed" });
      } finally {
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
