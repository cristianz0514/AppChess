import { NextRequest, NextResponse } from "next/server";
import { getMoveAtElo } from "@/services/stockfish";

// Returns the rival's reply move for a "Nacimiento de un Campeón" battle,
// played at an approximate target ELO (see strengthForElo in stockfish.ts).
export async function POST(req: NextRequest) {
  const { fen, elo } = await req.json().catch(() => ({}));
  if (!fen || typeof fen !== "string" || typeof elo !== "number") {
    return NextResponse.json({ error: "fen y elo son requeridos" }, { status: 400 });
  }
  try {
    const move = await getMoveAtElo(fen, elo);
    return NextResponse.json({ move });
  } catch {
    return NextResponse.json({ error: "El motor no está disponible" }, { status: 500 });
  }
}
