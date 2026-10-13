import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { isValidUsername } from "@/lib/validate";

// Streams NDJSON progress (same pattern as /api/analyze) so a full-history
// import — which can take a while for large accounts — never looks frozen.
export async function POST(req: NextRequest) {
  // A full-history import hits chess.com and writes thousands of rows, so one
  // client gets a handful per 10 minutes, not unlimited.
  const limited = rateLimit(req, "import", 12, 10 * 60_000);
  if (limited) return limited;

  // Checked before loading anything that touches the database: a missing
  // .env.local otherwise surfaced as an opaque 500 on every sign-in.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return new Response(
      JSON.stringify({ error: "El servidor no tiene configurada la base de datos (faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY)." }),
      { status: 503 },
    );
  }
  const { importGames } = await import("@/services/gameImport");

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
        send({ finished: true, imported: result.imported, userId: result.userId, stale: result.stale === true });
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
