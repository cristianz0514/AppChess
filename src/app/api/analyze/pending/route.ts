import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserId, getUnanalyzedGameIds } from "@/services/dashboardData";

// Returns the IDs of the user's games that still need Stockfish analysis.
// The user comes from the session cookie only — a `?username=` parameter used
// to override it, which let anyone list another player's pending games.
export async function GET() {
  const cookieStore = await cookies();
  const username = cookieStore.get("bv_username")?.value;
  if (!username) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const userId = await getUserId(decodeURIComponent(username).toLowerCase());
  if (!userId) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const pending = await getUnanalyzedGameIds(userId);
  return NextResponse.json({ pending, total: pending.length });
}
