import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserId } from "@/services/dashboardData";
import { recordPuzzleAttempt } from "@/services/puzzleProgress";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const username = cookieStore.get("bv_username")?.value;
  if (!username) return NextResponse.json({ error: "No session" }, { status: 401 });

  const userId = await getUserId(decodeURIComponent(username));
  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { puzzleId, solved } = await req.json().catch(() => ({}));
  if (!puzzleId || typeof solved !== "boolean") {
    return NextResponse.json({ error: "puzzleId and solved required" }, { status: 400 });
  }

  await recordPuzzleAttempt(userId, puzzleId, solved);
  return NextResponse.json({ ok: true });
}
