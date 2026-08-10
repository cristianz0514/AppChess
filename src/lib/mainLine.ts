// Reading the engine's main line as a PLAN, not just a first move.
//
// The engine hands back a principal variation — the sequence both sides would
// play. Until now we used exactly one move of it: the best move, for "lo indicado
// era X". Everything after that was thrown away, which is why the coach could say
// WHAT to play but never WHY.
//
// That "why" is where chess.com's Game Review gets its depth. "Con la torre a e7
// forzabas el mate" works because it names the point, not the move. And the point
// is always one or two moves further down the line: the quiet move that sets up
// the capture, the check that wins the piece, the pawn that walks in.
//
// Everything here is read off a line the engine actually returned and replayed
// through chess.js, so it can't invent a continuation.

import { Chess } from "chess.js";

const PIECE_ES: Record<string, string> = {
  p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey",
};

export interface LineStep {
  san: string;
  piece: string;      // Spanish
  to: string;
  captured: string | null;  // Spanish
  isCheck: boolean;
  isMate: boolean;
  byMover: boolean;   // played by the side we're advising
}

export interface LinePlan {
  steps: LineStep[];
  /** Every move in the line is a capture or a check — the opponent has no choice. */
  forced: boolean;
  /** A square captured on more than once: where the game is actually decided. */
  focusSquare: string | null;
  /** The advised side's SECOND move in the line — the point of the first one. */
  followUp: LineStep | null;
  /** True when `followUp` is the THIRD move because the second was just a recapture.
   *  The wording has to change with it: "y después te llevas X" claims the very next
   *  move, and by then a whole exchange has happened. */
  followUpIsThird: boolean;
  /** The biggest thing the advised side wins in the line. */
  wins: { piece: string; square: string } | null;
  /** The biggest thing the advised side loses in the line. */
  loses: { piece: string; square: string } | null;
  /** A pawn reaches the last rank. */
  promotes: boolean;
  /** The line ends in mate, and whether it favours the advised side. */
  mateFor: "mover" | "opponent" | null;
}

const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * Replays `sans` from `fromFen` and reports what the line is actually about.
 * `moverColor` is the side being advised, so "wins"/"loses" are from their view.
 */
export function readLine(fromFen: string, sans: string[], moverColor: "w" | "b"): LinePlan {
  const empty: LinePlan = {
    steps: [], forced: false, focusSquare: null, followUp: null, followUpIsThird: false,
    wins: null, loses: null, promotes: false, mateFor: null,
  };
  if (sans.length === 0) return empty;

  let board: Chess;
  try { board = new Chess(fromFen); } catch { return empty; }

  const steps: LineStep[] = [];
  const capturesPerSquare = new Map<string, number>();
  let promotes = false;
  let mateFor: LinePlan["mateFor"] = null;
  let bestWin = 0, bestLoss = 0;
  let wins: LinePlan["wins"] = null;
  let loses: LinePlan["loses"] = null;

  for (const san of sans) {
    let mv;
    try { mv = board.move(san); } catch { break; }
    if (!mv) break;

    const byMover = mv.color === moverColor;
    const step: LineStep = {
      san: mv.san,
      piece: PIECE_ES[mv.piece] ?? "pieza",
      to: mv.to,
      captured: mv.captured ? (PIECE_ES[mv.captured] ?? "pieza") : null,
      isCheck: mv.san.includes("+"),
      isMate: mv.san.includes("#"),
      byMover,
    };
    steps.push(step);

    if (mv.captured) {
      capturesPerSquare.set(mv.to, (capturesPerSquare.get(mv.to) ?? 0) + 1);
      const v = VAL[mv.captured] ?? 0;
      // Pawns are not worth announcing as "you win the …" in a plan sentence;
      // they're the noise of every line.
      if (byMover && v > bestWin && v >= 3) { bestWin = v; wins = { piece: step.captured!, square: mv.to }; }
      if (!byMover && v > bestLoss && v >= 3) { bestLoss = v; loses = { piece: step.captured!, square: mv.to }; }
    }
    if (mv.promotion) promotes = true;
    if (step.isMate) { mateFor = byMover ? "mover" : "opponent"; break; }
  }

  if (steps.length === 0) return empty;

  // "Forced" needs at least two moves to mean anything: a single capture is a
  // capture, not a sequence.
  const forced = steps.length >= 2 && steps.every((s) => s.captured || s.isCheck || s.isMate);

  let focusSquare: string | null = null;
  for (const [sq, n] of capturesPerSquare) if (n >= 2) focusSquare = sq;

  // The advised side's second move: the first one's actual purpose. A recapture is
  // skipped, because "take, they take, you take back" explains nothing — but skipping it
  // used to ANNUL the clause, and that turns out to be one of the two reasons the coach
  // names a move without saying what it is for. Measured over 25 real games: 151
  // comments recommended a move and 3 said why. A line that opens with a capture is
  // most of the interesting ones, and those are exactly the lines whose second move is
  // the recapture. So when the second move is a retake, the point is one move further
  // down: look at the THIRD instead of giving up.
  //
  // It stops at the third, deliberately. Past that the line is the engine's rather than
  // the opponent's — a 1050 will not follow the PV to ply 8, so claiming it would be
  // claiming something the game is not going to back. Same discipline as `settled`.
  const mine = steps.filter((s) => s.byMover);
  const isRetake = (k: number) => !!(mine[k].captured && mine[k].to === mine[k - 1]?.to);
  let followUp: LineStep | null = null;
  let followUpIsThird = false;
  for (let k = 1; k <= 2 && k < mine.length; k++) {
    if (isRetake(k)) continue;
    followUp = mine[k];
    followUpIsThird = k === 2;
    break;
  }

  return { steps, forced, focusSquare, followUp, followUpIsThird, wins, loses, promotes, mateFor };
}

/**
 * One clause describing the follow-up, or null when there's nothing worth saying.
 *
 * `voice` is not optional decoration. The same LinePlan describes the PLAYER's
 * best line and the OPPONENT's punishment line, and "y después te llevas la
 * torre" is flatly wrong in the second case — it hands the player a capture the
 * rival is making. Getting this backwards is the single most confusing mistake a
 * coach comment can make, so the caller has to say whose move it is.
 */
export function followUpClause(plan: LinePlan, voice: "player" | "opponent" = "player"): string | null {
  const f = plan.followUp;
  if (!f) return null;
  const mine = voice === "player";
  // "después" claims the very NEXT move. When the follow-up is the third — because the
  // second was the recapture — a whole exchange has happened first, so the connector has
  // to admit it. Getting this wrong would make the clause a false claim about WHEN,
  // which is the same class of error as getting the voice backwards.
  const then = plan.followUpIsThird
    ? (mine ? "y acabas llevándote" : "y acaba llevándose")
    : (mine ? "y después te llevas" : "y luego se lleva");
  if (f.isMate) return `y remata con ${art(f.piece)} en ${f.to}`;
  if (f.captured) return `${then} ${art(f.captured)} de ${f.to}`;
  if (f.isCheck) {
    // Two fixes here, found by review rather than by a screenshot.
    //
    // `deArt`: this read "jaque de el alfil en c5" — Spanish contracts de+el into del, and
    // this file did not have the helper coachComment.ts already carries for exactly this.
    // The bug shipped in 0aa1a28 and had never been read aloud.
    //
    // And the third-move connector, which the first pass wired into the capture and quiet
    // branches and forgot here: a check three moves down was still being announced with
    // "sigues", which claims the very NEXT move. Same false claim about WHEN that the
    // capture branch was fixed for.
    const now = plan.followUpIsThird
      ? (mine ? "y acabas dando jaque" : "y acaba dando jaque")
      : (mine ? "y sigues con jaque" : "y sigue con jaque");
    return `${now} ${deArt(f.piece)} en ${f.to}`;
  }
  const move = plan.followUpIsThird
    ? (mine ? "y acabas jugando" : "y acaba jugando")
    : (mine ? "y después" : "y luego");
  return `${move} ${art(f.piece)} a ${f.to}`;
}

/**
 * The prefix of a STORED line that still replays from `fromFen`, or null.
 *
 * `moves.best_line` was written by an earlier run of the analysis, so by the time the
 * viewer walks it nothing guarantees it still fits the position in front of it: a row could
 * belong to a different ply, a game could have been re-imported, the column could hold
 * something from a previous schema. Showing the player a sequence that cannot happen is
 * worse than showing them nothing, so the line is VERIFIED here rather than trusted.
 *
 * `expectFirst` is the move the viewer's arrow points at (`moves.best_move`). A line whose
 * first move is something else is not this move's line, and would put the arrow and the
 * preview into exactly the disagreement that persisting best_move was meant to end.
 *
 * Lives here rather than inline in the component because this is the part that can be
 * wrong. The stepping and the highlighting are React; this is chess.
 */
export function verifiedLine(fromFen: string, sans: readonly string[], expectFirst: string): string[] | null {
  if (sans.length === 0 || sans[0] !== expectFirst) return null;
  let board: Chess;
  try { board = new Chess(fromFen); } catch { return null; }
  const out: string[] = [];
  for (const san of sans) {
    let mv = null;
    try { mv = board.move(san); } catch { mv = null; }
    if (!mv) break;   // keep the prefix that works; drop the rest silently
    out.push(mv.san);
  }
  return out.length > 1 ? out : null;
}

const ART: Record<string, string> = {
  "peón": "el peón", caballo: "el caballo", alfil: "el alfil",
  torre: "la torre", dama: "la dama", rey: "el rey",
};
const art = (p: string) => ART[p] ?? `el ${p}`;
/** "de" plus the article, contracted: de + el -> del. Spanish has no "de el". */
const deArt = (p: string) => {
  const a = art(p);
  return a.startsWith("el ") ? `del ${a.slice(3)}` : `de ${a}`;
};
