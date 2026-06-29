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

function extractGameId(url: string): string {
  const parts = url.split("/");
  return parts[parts.length - 1] ?? url;
}
