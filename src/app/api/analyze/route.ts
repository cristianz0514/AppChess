import { NextRequest, NextResponse } from "next/server";
import { analyzeGame } from "@/services/blunderDetector";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { gameId } = await req.json();

    if (!gameId || typeof gameId !== "string") {
      return NextResponse.json({ error: "gameId required" }, { status: 400 });
    }

    const { data: game } = await supabase
      .from("games")
      .select("id, pgn")
      .eq("id", gameId)
      .single();

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    await analyzeGame(game.id, game.pgn);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
