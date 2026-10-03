import { NextRequest, NextResponse } from "next/server";
import { getMoveAtElo, EngineBusyError } from "@/services/stockfish";
import { rateLimit } from "@/lib/rateLimit";
import { isValidFen } from "@/lib/validate";

// Returns the rival's reply move for a "Nacimiento de un Campeón" battle,
// played at an approximate target ELO (see strengthForElo in stockfish.ts).
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "champions-move", 90, 60_000);
  if (limited) return limited;

  const { fen, elo } = await req.json().catch(() => ({}));
  if (!isValidFen(fen) || typeof elo !== "number" || !Number.isFinite(elo) || elo < 100 || elo > 3200) {
    return NextResponse.json({ error: "fen válido y elo (100-3200) son requeridos" }, { status: 400 });
  }
  try {
    const move = await getMoveAtElo(fen, elo);
    return NextResponse.json({ move });
  } catch (err) {
    if (err instanceof EngineBusyError) return NextResponse.json({ error: "El motor está ocupado, reintenta" }, { status: 503 });
    return NextResponse.json({ error: "El motor no está disponible" }, { status: 500 });
  }
}
