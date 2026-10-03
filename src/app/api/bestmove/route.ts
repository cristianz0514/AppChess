import { NextRequest, NextResponse } from "next/server";
import { getBestMove, EngineBusyError } from "@/services/stockfish";
import { rateLimit } from "@/lib/rateLimit";
import { isValidFen } from "@/lib/validate";

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "bestmove", 120, 60_000);
  if (limited) return limited;

  const fen = req.nextUrl.searchParams.get("fen");
  if (!fen) return NextResponse.json({ error: "fen requerido" }, { status: 400 });
  if (!isValidFen(fen)) return NextResponse.json({ error: "fen inválido" }, { status: 400 });
  try {
    const move = await getBestMove(fen, 12);
    if (!move) return NextResponse.json({ error: "sin jugada" }, { status: 404 });
    return NextResponse.json(move);
  } catch (err) {
    if (err instanceof EngineBusyError) return NextResponse.json({ error: "motor ocupado" }, { status: 503 });
    return NextResponse.json({ error: "error del motor" }, { status: 500 });
  }
}
