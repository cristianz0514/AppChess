import { NextRequest } from "next/server";
import { importGames } from "@/services/gameImport";

// Streams NDJSON progress (same pattern as /api/analyze) so a full-history
// import — which can take a while for large accounts — never looks frozen.
export async function POST(req: NextRequest) {
  const { username } = await req.json().catch(() => ({}));

  if (!username || typeof username !== "string") {
    return new Response(JSON.stringify({ error: "Escribe tu usuario de Chess.com" }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };
      try {
        const result = await importGames(username.trim(), (phase, done, total) => {
          send({ phase, done, total });
        });
        send({ finished: true, imported: result.imported, userId: result.userId });
      } catch (err) {
        send({ error: err instanceof Error ? err.message : "No se pudo importar. Inténtalo de nuevo." });
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
