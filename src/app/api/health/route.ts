import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

// One URL that says what is wrong, instead of every page answering a mute 500.
// It reports only booleans/status words — never a URL, key or error text — so it
// is safe to leave public. It also touches the database on purpose: Supabase's
// free tier pauses a project after about a week without activity, and the daily
// cron in vercel.json calls this route to keep it awake.
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "health", 30, 60_000);
  if (limited) return limited;

  const envOk = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let db: "ok" | "error" | "sin_configurar" = "sin_configurar";

  if (envOk) {
    try {
      const { supabase } = await import("@/lib/supabase");
      const { error } = await supabase.from("users").select("id", { count: "exact", head: true });
      db = error ? "error" : "ok";
    } catch {
      db = "error";
    }
  }

  const ok = envOk && db === "ok";
  return NextResponse.json({ ok, env: envOk, db }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
