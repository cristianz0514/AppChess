import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserId } from "@/services/dashboardData";
import { minePlayerMates } from "@/services/puzzles";

// Scans the player's own analyzed games for real forced mates they could
// deliver, turning them into personalized road-trip nodes.
export async function POST() {
  const cookieStore = await cookies();
  const username = cookieStore.get("bv_username")?.value;
  if (!username) return NextResponse.json({ error: "No session" }, { status: 401 });

  const userId = await getUserId(decodeURIComponent(username));
  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  try {
    const result = await minePlayerMates(userId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "mining failed" }, { status: 500 });
  }
}
