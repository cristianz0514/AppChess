import { NextRequest } from "next/server";
import { importGames } from "@/services/gameImport";
import { rateLimit } from "@/lib/rateLimit";
import { isValidUsername } from "@/lib/validate";

// Streams NDJSON progress (same pattern as /api/analyze) so a full-history
// import — which can take a while for large accounts — never looks frozen.
export async function POST(req: NextRequest) {
  // A full-history import hits chess.com and writes thousands of rows, so one
  // client gets a handful per 10 minutes, not unlimited.
  const limited = rateLimit(req, "import", 5, 10 * 60_000);
  if (limited) return limited;

  const { username } = await req.json().catch(() => ({}));
  const name = typeof username === "string" ? username.trim() : "";

  if (!name) {
    return new Response(JSON.stringify({ error: "Escribe tu usuario de Chess.com" }), { status: 400 });
  }
  if (!isValidUsername(name)) {
    return new Response(
      JSON.stringify({ error: "Usuario no válido: 3 a 25 caracteres, solo letras, números, guion y guion bajo." }),
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };
      try {
        const result = await importGames(name, (phase, done, total) => {
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
