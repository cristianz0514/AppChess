import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserId, getUnanalyzedGameIds } from "@/services/dashboardData";

// Returns the IDs of the user's games that still need Stockfish analysis.
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const usernameParam = req.nextUrl.searchParams.get("username");
  const username = usernameParam ?? cookieStore.get("bv_username")?.value;
  if (!username) return NextResponse.json({ error: "No session" }, { status: 401 });

  const userId = await getUserId(decodeURIComponent(username).toLowerCase());
  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const pending = await getUnanalyzedGameIds(userId);
  return NextResponse.json({ pending, total: pending.length });
}
