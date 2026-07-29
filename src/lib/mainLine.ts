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
    steps: [], forced: false, focusSquare: null, followUp: null,
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

  // The advised side's second move: the first one's actual purpose. Skipped when
  // it's a recapture, which explains nothing ("take, they take, you take back").
  const mine = steps.filter((s) => s.byMover);
  const second = mine[1] ?? null;
  const followUp = second && !(second.captured && second.to === mine[0]?.to) ? second : null;

  return { steps, forced, focusSquare, followUp, wins, loses, promotes, mateFor };
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
  if (f.isMate) return mine ? `y remata con ${art(f.piece)} en ${f.to}` : `y remata con ${art(f.piece)} en ${f.to}`;
  if (f.captured) {
    return mine
      ? `y después te llevas ${art(f.captured)} de ${f.to}`
      : `y luego se lleva ${art(f.captured)} de ${f.to}`;
  }
  if (f.isCheck) {
    return mine
      ? `y sigues con jaque de ${art(f.piece)} en ${f.to}`
      : `y sigue con jaque de ${art(f.piece)} en ${f.to}`;
  }
  return mine ? `y después ${art(f.piece)} a ${f.to}` : `y luego ${art(f.piece)} a ${f.to}`;
}

const ART: Record<string, string> = {
  "peón": "el peón", caballo: "el caballo", alfil: "el alfil",
  torre: "la torre", dama: "la dama", rey: "el rey",
};
const art = (p: string) => ART[p] ?? `el ${p}`;
