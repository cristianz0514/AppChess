import { NextRequest, NextResponse } from "next/server";
import { getBestMove } from "@/services/stockfish";

export async function GET(req: NextRequest) {
  const fen = req.nextUrl.searchParams.get("fen");
  if (!fen) return NextResponse.json({ error: "fen required" }, { status: 400 });
  try {
    const move = await getBestMove(fen, 14);
    if (!move) return NextResponse.json({ error: "no move found" }, { status: 404 });
    return NextResponse.json(move);
  } catch {
    return NextResponse.json({ error: "engine error" }, { status: 500 });
  }
}
