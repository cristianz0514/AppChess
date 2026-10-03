import { NextResponse } from "next/server";

// Best-effort, in-memory sliding-window limiter. It is per server instance
// (each serverless instance / Render process counts on its own), so it is a
// brake against a runaway script, not a hard quota — a real shared limit would
// need an external store (Upstash/Redis). Good enough to stop one client from
// monopolising the single engine or hammering chess.com through /api/import.
const buckets = new Map<string, number[]>();
const MAX_BUCKETS = 5000;

function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip")) || "unknown";
}

// Returns a 429 response when `name` was called more than `max` times in the
// last `windowMs` by this client, or null when the call may proceed.
export function rateLimit(req: Request, name: string, max: number, windowMs: number): NextResponse | null {
  const now = Date.now();
  const key = `${name}:${clientKey(req)}`;
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    const retry = Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000));
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta de nuevo en unos segundos." },
      { status: 429, headers: { "Retry-After": String(retry) } },
    );
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return null;
}
