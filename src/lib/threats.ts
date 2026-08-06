// Null-move threat detection — "what would happen if I could pass?"
//
// The idea comes from null-move pruning in engines: hand the opponent a free
// move and see what they'd do with it. If the position collapses, they had a
// threat you weren't seeing.
//
// This fills a real hole. Every other detector we have answers "what did this
// move DO". None of them answer "what is the opponent about to do to you" —
// and at club level the move that loses the game is usually the one played
// while ignoring a threat, not a move that's bad in itself. It's also the only
// comment in the set that's genuinely predictive rather than descriptive.
//
// No engine search: the free move is enumerated with chess.js and scored with
// SEE-style material arithmetic, so the whole thing costs microseconds.

import { Chess } from "chess.js";
import { buildAttackMap, attackersOf, PIECE_VALUE, type Color } from "./attackMap";

export interface Threat {
  kind: "mate" | "material";
  piece: string;      // piece letter the opponent would win (material) or attack with (mate)
  square: string;
  gain: number;       // pawns the opponent would win
}

/** Flip whose turn it is without playing a move — the "null move". */
function passTurn(fen: string): string | null {
  const parts = fen.split(" ");
  if (parts.length < 4) return null;
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-";              // an en-passant target can't survive a passed turn
  return parts.join(" ");
}

/**
 * The best thing the opponent could do if handed a free move. Returns null when
 * they have nothing — which is most of the time, and staying quiet then is the
 * point: a coach that warns about a threat on every move teaches nothing.
 */
export function opponentThreat(fenAfterMyMove: string, me: Color): Threat | null {
  // fenAfterMyMove already has the opponent to move, so their reply is their
  // own turn — no pass needed. The pass matters for the OTHER direction (below).
  let board: Chess;
  try { board = new Chess(fenAfterMyMove); } catch { return null; }
  if (board.turn() === me) return null;

  const map = buildAttackMap(fenAfterMyMove);
  let best: Threat | null = null;

  for (const mv of board.moves({ verbose: true })) {
    if (mv.san.includes("#")) {
      return { kind: "mate", piece: mv.piece, square: mv.to, gain: 99 };
    }
    if (!mv.captured) continue;

    // What the capture wins, minus what it costs if we can recapture. Cheap
    // stand-in for SEE: enough to rank threats, and it never overstates —
    // an undefended piece is the case that matters and it gets that exactly right.
    const won = PIECE_VALUE[mv.captured] ?? 0;
    const defenders = attackersOf(map, mv.to, me).length;
    const gain = defenders > 0 ? won - (PIECE_VALUE[mv.piece] ?? 0) : won;
    if (gain <= 0) continue;
    if (!best || gain > best.gain) best = { kind: "material", piece: mv.captured, square: mv.to, gain };
  }
  return best;
}

/**
 * The threat the PLAYER built and the opponent now has to answer. Same question
 * from the other side, and this one does need the null move: it asks what would
 * happen if the player got to move again.
 */
/** Best thing `me` can win in a position where `me` is ALREADY to move. */
function bestWinHere(fen: string, me: Color): Threat | null {
  let board: Chess;
  try { board = new Chess(fen); } catch { return null; }
  if (board.turn() !== me) return null;

  const map = buildAttackMap(fen);
  const enemy: Color = me === "w" ? "b" : "w";
  let best: Threat | null = null;

  for (const mv of board.moves({ verbose: true })) {
    if (mv.san.includes("#")) return { kind: "mate", piece: mv.piece, square: mv.to, gain: 99 };
    if (!mv.captured) continue;
    const won = PIECE_VALUE[mv.captured] ?? 0;
    const defenders = attackersOf(map, mv.to, enemy).length;
    const gain = defenders > 0 ? won - (PIECE_VALUE[mv.piece] ?? 0) : won;
    if (gain <= 0) continue;
    if (!best || gain > best.gain) best = { kind: "material", piece: mv.captured, square: mv.to, gain };
  }
  return best;
}

export function ownThreat(fenAfterMyMove: string, me: Color, fenBefore?: string): Threat | null {
  const passed = passTurn(fenAfterMyMove);
  if (!passed) return null;
  const after = bestWinHere(passed, me);
  if (!after) return null;

  // Was this ALREADY available before the move? Without asking, a threat that has
  // been sitting on the board for several moves gets re-attributed to whatever was
  // played, and every template here opens with "ahora" — asserting a novelty
  // nothing checked. Seen in a real game: an undefended bishop on c4 produced
  // "Ojo, ahora va contra tu alfil de c4" on 6...Be7, a move that does not touch
  // c4, after the same bishop had already been announced two moves earlier.
  //
  // `ignoredThreat` below has always done this comparison; ownThreat simply never
  // did. No null move is needed on the BEFORE side: it is already `me`'s turn there.
  if (!fenBefore) return after;
  const before = bestWinHere(fenBefore, me);
  if (before && before.square === after.square && before.gain >= after.gain) return null;
  return after;
}

/**
 * Did the move IGNORE a threat that was already there? Only true when the same
 * threat existed before the move and still exists after it — otherwise we'd be
 * blaming the player for a threat their own move created, which reads as
 * nonsense to anyone replaying the game.
 */
export function ignoredThreat(fenBefore: string, fenAfterMyMove: string, me: Color): Threat | null {
  const after = opponentThreat(fenAfterMyMove, me);
  if (!after) return null;
  // Was it already on the board before the move? Pass the turn in the BEFORE
  // position to ask what the opponent was threatening then.
  const passedBefore = passTurn(fenBefore);
  if (!passedBefore) return null;
  const before = opponentThreat(passedBefore, me);
  if (!before) return null;
  return before.square === after.square && before.gain >= after.gain ? after : null;
}
