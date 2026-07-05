import type { ChessComGame } from "./chesscom";
import type { Game } from "@/types";

export interface ParsedGame
  extends Omit<Game, "id" | "user_id" | "accuracy" | "created_at"> {
  chess_game_id: string;
}

export function parseGame(
  raw: ChessComGame,
  username: string
): ParsedGame | null {
  try {
    const headers = parsePgnHeaders(raw.pgn);
    const lowerUsername = username.toLowerCase();

    const playedAs =
      raw.white.username.toLowerCase() === lowerUsername ? "white" : "black";

    const result = resolveResult(raw, playedAs);
    const opening = headers["Opening"] ?? headers["ECOUrl"] ?? "Unknown";
    const openingName = opening.includes("/")
      ? opening.split("/").pop()!
      : opening;

    return {
      chess_game_id: extractGameId(raw.url),
      pgn: raw.pgn,
      opening: openingName.replace(/-/g, " "),
      result,
      white_rating: raw.white.rating,
      black_rating: raw.black.rating,
      time_control: raw.time_control,
      time_class: raw.time_class ?? classifyTimeControl(raw.time_control),
      played_at: raw.end_time ? new Date(raw.end_time * 1000).toISOString() : null,
      ended_by_abandonment: endedByAbandonment(raw.pgn),
      played_as: playedAs,
    };
  } catch {
    return null;
  }
}

export function parseGames(
  rawGames: ChessComGame[],
  username: string
): ParsedGame[] {
  return rawGames
    .map((g) => parseGame(g, username))
    .filter((g): g is ParsedGame => g !== null);
}

// True when the game ended because a player abandoned / disconnected, rather than
// a real over-the-board finish (checkmate, resignation, time, agreement, …).
// chess.com writes this into the PGN [Termination "…"] header, e.g.
// "Player won - game abandoned" / "won by abandonment".
export function endedByAbandonment(pgn: string): boolean {
  const headers = parsePgnHeaders(pgn);
  const termination = (headers["Termination"] ?? "").toLowerCase();
  return /abandon/.test(termination);
}

function parsePgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const headerRegex = /\[(\w+)\s+"([^"]*)"\]/g;
  let match;
  while ((match = headerRegex.exec(pgn)) !== null) {
    headers[match[1]] = match[2];
  }
  return headers;
}

function resolveResult(
  game: ChessComGame,
  playedAs: "white" | "black"
): "win" | "loss" | "draw" {
  const playerResult =
    playedAs === "white" ? game.white.result : game.black.result;

  if (playerResult === "win") return "win";
  if (["checkmated", "timeout", "resigned", "lose", "abandoned"].includes(playerResult))
    return "loss";
  return "draw";
}

// Fallback when the API doesn't send time_class: derive it from the base seconds.
// Chess.com daily games use "N/seconds" (correspondence); live games use "base+inc".
function classifyTimeControl(tc: string): string {
  if (!tc) return "unknown";
  if (tc.includes("/")) return "daily";
  const base = parseInt(tc.split("+")[0], 10);
  if (isNaN(base)) return "unknown";
  if (base < 180) return "bullet";
  if (base < 600) return "blitz";
  return "rapid";
}

function extractGameId(url: string): string {
  const parts = url.split("/");
  return parts[parts.length - 1] ?? url;
}
