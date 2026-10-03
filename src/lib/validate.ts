import { Chess } from "chess.js";

// A FEN goes straight into the engine in several routes; an invalid one
// wastes a search slot (or hangs the search until its timeout), so check it
// with chess.js first.
export function isValidFen(fen: unknown): fen is string {
  if (typeof fen !== "string" || fen.length > 100) return false;
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

// chess.com usernames: 3-25 chars of letters, digits, underscore or hyphen.
export const USERNAME_RE = /^[A-Za-z0-9_-]{3,25}$/;
export const isValidUsername = (u: unknown): u is string => typeof u === "string" && USERNAME_RE.test(u);
