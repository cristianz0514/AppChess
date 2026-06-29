import { NextRequest, NextResponse } from "next/server";
import { generateInsights } from "@/services/insightsGenerator";
import { getUserId } from "@/services/dashboardData";

export async function POST(req: NextRequest) {
  try {
    const { username } = await req.json();

    if (!username || typeof username !== "string") {
      return NextResponse.json({ error: "username required" }, { status: 400 });
    }

    const userId = await getUserId(username.toLowerCase());
    if (!userId) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await generateInsights(userId);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate insights";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
