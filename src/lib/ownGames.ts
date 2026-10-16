// Which games and which half-moves count as the PLAYER's own.
//
// The `moves` table holds BOTH sides of every analysed game (the rival's moves are
// classified too: that is how "el rival se equivocó" comments work). Any figure that
// says "tus errores" has to count only the half-moves the player actually played, or it
// reports the rival's blunders as the player's. And champion battles ("Nacimiento de un
// Campeón") are stored as games too, with no rating, no time class and no opponent from
// chess.com, so they do not belong in rating, win-rate or opening figures.

type Side = "white" | "black";

/** True when half-move `ply` (0 = White's first move) was played by the side `playedAs`. */
export function isOwnPly(ply: number, playedAs: Side): boolean {
  return (ply % 2 === 0) === (playedAs === "white");
}

/**
 * Whether a `moves` row is the player's own. A row whose `ply` is null comes from a game
 * analysed before that column existed: whose move it was cannot be told, so it is NOT counted as
 * the player's (counting both sides, as it used to, put the rival's errors on the player) until
 * the game is analysed again. A row with no `ply` property at all means the database has no such
 * column yet; then nothing can tell the sides apart and every row is kept.
 */
export function isOwnRow(row: { ply?: number | null }, playedAs: Side): boolean {
  if (row.ply === undefined) return true;
  return row.ply !== null && isOwnPly(row.ply, playedAs);
}

/** The player's own rows out of one game's rows (see isOwnRow for the ones that cannot be told). */
export function ownRows<T extends { ply?: number | null }>(rows: readonly T[], playedAs: Side): T[] {
  return rows.filter((r) => isOwnRow(r, playedAs));
}

/** Champion battles carry a synthetic "campeones-…" id instead of a real chess.com one. */
export function isChampionBattle(chessGameId: string | null | undefined): boolean {
  return chessGameId?.startsWith("campeones-") ?? false;
}
