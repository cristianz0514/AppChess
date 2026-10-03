import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateInsights } from "@/services/insightsGenerator";
import { getUserId } from "@/services/dashboardData";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  // The user comes from the session cookie only. It used to be read from the
  // request body, so anyone could regenerate another player's insights.
  const cookieStore = await cookies();
  const username = cookieStore.get("bv_username")?.value;
  if (!username) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const limited = rateLimit(req, "insights", 6, 60_000);
  if (limited) return limited;

  try {
    const userId = await getUserId(decodeURIComponent(username).toLowerCase());
    if (!userId) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    await generateInsights(userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[insights]", err);
    return NextResponse.json({ error: "No se pudieron generar los insights" }, { status: 500 });
  }
}
