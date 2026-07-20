import { Chess } from "chess.js";
import { supabase } from "@/lib/supabase";
import { translateOpening } from "@/lib/translateOpening";
import { hasModernSchema } from "./dashboardData";

// "Entrena tus errores" — turns the player's OWN blunder/mistake positions
// into replayable exercises: the board at the position right before the bad
// move, "you played X, find the better move". No new tables — the positions
// are reconstructed on the fly from each game's PGN (the same technique the
// insights engine uses), and the best-move solution is computed per-exercise
// on demand (see /api/exercise) so we never run Stockfish in a batch here.

export interface ErrorExercise {
  id: string;              // stable key (gameId:ply) — used for localStorage progress
  gameId: string;
  fen: string;             // position BEFORE the mistake — the player is to move
  playedSan: string;       // the move they actually played (the mistake)
  orientation: "white" | "black";
  moveNumber: number;
  opening: string | null;
  result: "win" | "loss" | "draw";
  centipawnLoss: number;
}

// Champion-battle games aren't real rated games — skip them as exercise sources.
const isChampionBattle = (chessGameId: string | null) => chessGameId?.startsWith("campeones-") ?? false;

export async function getErrorExercises(userId: string, limit = 12): Promise<ErrorExercise[]> {
  const orderCol = (await hasModernSchema()) ? "played_at" : "created_at";
  const { data: gameRows } = await supabase
    .from("games")
    .select("id, pgn, played_as, opening, result, chess_game_id")
    .eq("user_id", userId)
    .order(orderCol, { ascending: false, nullsFirst: true })
    .limit(60);

  if (!gameRows || gameRows.length === 0) return [];

  const games = gameRows.filter((g) => g.pgn && !isChampionBattle(g.chess_game_id));
  const gameById = new Map(games.map((g) => [g.id, g]));
  const gameIds = games.map((g) => g.id);
  if (gameIds.length === 0) return [];

  const { data: moveRows } = await supabase
    .from("moves")
    .select("game_id, move_number, move, classification, centipawn_loss")
    .in("game_id", gameIds)
    .in("classification", ["blunder", "mistake"]);

  if (!moveRows || moveRows.length === 0) return [];

  // Group blunders per game, keyed by move_number+SAN (unambiguous enough with
  // the player-color check below), carrying the centipawn loss for ranking.
  const blundersByGame = new Map<string, Map<string, number>>();
  for (const m of moveRows) {
    if (!m.move) continue;
    if (!blundersByGame.has(m.game_id)) blundersByGame.set(m.game_id, new Map());
    blundersByGame.get(m.game_id)!.set(`${m.move_number}:${m.move}`, m.centipawn_loss ?? 0);
  }

  const exercises: ErrorExercise[] = [];
  for (const gameId of gameIds) {
    const game = gameById.get(gameId)!;
    const blunders = blundersByGame.get(gameId);
    if (!blunders) continue;
    const playerColor = game.played_as === "white" ? "w" : "b";
    const chess = new Chess();
    try { chess.loadPgn(game.pgn); } catch { continue; }
    const hist = chess.history({ verbose: true });
    for (let ply = 0; ply < hist.length; ply++) {
      const h = hist[ply];
      if (h.color !== playerColor) continue;
      const moveNumber = Math.floor(ply / 2) + 1;
      const cpl = blunders.get(`${moveNumber}:${h.san}`);
      if (cpl === undefined) continue;
      exercises.push({
        id: `${gameId}:${ply}`,
        gameId,
        fen: h.before,
        playedSan: h.san,
        orientation: game.played_as === "white" ? "white" : "black",
        moveNumber,
        opening: game.opening ? translateOpening(game.opening) : null,
        result: game.result as ErrorExercise["result"],
        centipawnLoss: cpl,
      });
    }
  }

  // Biggest mistakes first — the most instructive positions to retrain on.
  exercises.sort((a, b) => b.centipawnLoss - a.centipawnLoss);
  return exercises.slice(0, limit);
}
