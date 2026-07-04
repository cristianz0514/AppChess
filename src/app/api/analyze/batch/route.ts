import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/services/dashboardData";
import { startBatch, stopBatch, getBatchStatus } from "@/services/analysisQueue";

// GET  → current background-analysis progress
// POST { username }          → start the batch (returns immediately)
// POST { action: "stop" }    → stop the running batch
export async function GET() {
  return NextResponse.json(getBatchStatus());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  if (body?.action === "stop") {
    stopBatch();
    return NextResponse.json(getBatchStatus());
  }

  const username = body?.username;
  if (!username || typeof username !== "string") {
    return NextResponse.json({ error: "username required" }, { status: 400 });
  }
  const userId = await getUserId(username.toLowerCase());
  if (!userId) return NextResponse.json({ error: "user not found" }, { status: 404 });

  const result = await startBatch(userId);
  return NextResponse.json({ ...result, ...getBatchStatus() });
}
