import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const VALID_RESULTS = ["win", "loss", "draw"];
const VALID_COLORS = ["white", "black"];

// Champion battles are played entirely in-browser and never touch the
// `games` table, so there was no way to send one into the app's own
// Stockfish analysis tool. This persists the finished battle as a real game
// row (a synthetic chess_game_id, since it didn't come from chess.com) and
// hands back its id — the caller then just navigates to /blunders/{id},
// which already knows how to auto-analyze a game with zero moves saved.
export async function POST(req: NextRequest) {
  const { userId, championId, chapterId, pgn, playerColor, result } = await req.json().catch(() => ({}));

  if (
    !userId || typeof pgn !== "string" || !pgn.trim() ||
    !VALID_COLORS.includes(playerColor) || !VALID_RESULTS.includes(result)
  ) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const chessGameId = `campeones-${championId}-${chapterId}-${userId}-${Date.now()}`;

  const { data, error } = await supabase
    .from("games")
    .insert({
      user_id: userId,
      chess_game_id: chessGameId,
      pgn,
      result,
      played_as: playerColor,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "No se pudo guardar la partida" }, { status: 500 });
  }

  return NextResponse.json({ gameId: data.id });
}
