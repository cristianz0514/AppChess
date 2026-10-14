import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserId, getUnanalyzedGameIds, getAllGameIds } from "@/services/dashboardData";

// Returns the IDs of the user's games that still need Stockfish analysis.
// The user comes from the session cookie only — a `?username=` parameter used
// to override it, which let anyone list another player's pending games.
export async function GET(req: Request) {
  const cookieStore = await cookies();
  const username = cookieStore.get("bv_username")?.value;
  if (!username) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const userId = await getUserId(decodeURIComponent(username).toLowerCase());
  if (!userId) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  // ?all=1 lists every recent game, for regenerating analyses that already exist.
  const all = new URL(req.url).searchParams.get("all") === "1";
  const pending = all ? await getAllGameIds(userId) : await getUnanalyzedGameIds(userId);
  return NextResponse.json({ pending, total: pending.length });
}
