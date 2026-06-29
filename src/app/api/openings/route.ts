import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserId, getOpeningsByColor, getColorStats } from "@/services/dashboardData";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const username = cookieStore.get("bv_username")?.value;
  if (!username) return NextResponse.json({ error: "No session" }, { status: 401 });

  const color = (req.nextUrl.searchParams.get("color") ?? "both") as "white" | "black" | "both";

  const userId = await getUserId(decodeURIComponent(username));
  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [openings, colors] = await Promise.all([
    getOpeningsByColor(userId, color),
    getColorStats(userId),
  ]);

  return NextResponse.json({
    openings,
    colorsWhite: colors.white,
    colorsBlack: colors.black,
    username: decodeURIComponent(username),
  });
}
