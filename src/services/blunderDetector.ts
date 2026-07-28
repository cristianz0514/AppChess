import { Chess, type Square } from "chess.js";
import { analyzeAllFens, evaluatePosition, getTopLines } from "./stockfish";
import { supabase } from "@/lib/supabase";
import { detectMotifs } from "@/lib/tacticalMotifs";
import { composeCoachComment, type Motif } from "@/lib/coachComment";
import { isBookMove } from "@/lib/openingBook";
import { overloadedDefender, underDefended } from "@/lib/attackMap";
import { structureChange } from "@/lib/pawnStructure";
import { dominantChange, pressureOnOpponent } from "@/lib/evalTerms";
import type { Move } from "@/types";

export type MoveClassification = Move["classification"];

// How many moves get a coach comment. Only the moves that matter (errors +
// brilliant/great) — the ones an expert actually reads. The real cost per
// comment is the ENGINE (two deep searches), not the text: comments are now
// generated deterministically from templates, so there's no API quota or
// latency attached to them at all.
const MAX_EXPLAIN = 20;
// Depth for the coach lines. Tuned to what the free-tier CPU can actually FINISH
// within the engine timeout — too deep and it times out with EMPTY lines, which
// strips the comment of its grounding and makes it worse, not better.
const EXPLAIN_DEPTH = 14;
const EXPLAIN_CLASSES = new Set(["blunder", "mistake", "inaccuracy", "brilliant", "great"]);

const PIECE_ES: Record<string, string> = { p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey" };
const PIECE_VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// ── Concrete, verifiable context for the coach (chess.com-style) ─────────────
// These compute the things chess.com's coach actually says — "se pierde un
// alfil", "la partida estaba igualada pero ahora tu rival tiene ventaja",
// "solo había una jugada buena" — in CODE, so the model narrates real facts
// instead of guessing at them.

// Which side ends up down material over the engine's line, and the biggest
// piece the player loses in it. This is what turns a vague "permites algo
// malo" into "pierdes un alfil" / "gana una torre tras los intercambios".
function materialOverLine(fromFen: string, sans: string[], playerColor: "w" | "b"): {
  net: number;                    // >0 = the player ends up DOWN this many pawns
  biggestLostType: string | null; // piece type letter (p/n/b/r/q) the player loses
  trades: boolean;                // captures on both sides (an exchange sequence)
  settled: boolean;               // the line does NOT end mid-exchange
} {
  const c = new Chess(fromFen);
  let net = 0, biggest = 0, byPlayer = 0, byOpponent = 0;
  let biggestLostType: string | null = null;
  let lastWasOpponentCapture = false;
  for (const san of sans) {
    let mv;
    try { mv = c.move(san); } catch { break; }
    if (!mv) break;
    if (!mv.captured) { lastWasOpponentCapture = false; continue; }
    const v = PIECE_VAL[mv.captured] ?? 0;
    if (mv.color === playerColor) { net -= v; byPlayer++; lastWasOpponentCapture = false; }
    else {
      net += v; byOpponent++; lastWasOpponentCapture = true;
      if (v > biggest) { biggest = v; biggestLostType = mv.captured; }
    }
  }
  // The engine's PV is truncated (6 plies), so a line that ENDS on the
  // opponent capturing is very likely mid-exchange — the recapture just falls
  // outside the window. Claiming "se pierde el caballo" off such a line
  // overstates the loss, so callers must treat it as unsettled.
  return { net, biggestLostType, trades: byPlayer > 0 && byOpponent > 0, settled: !lastWasOpponentCapture };
}

// ── Cheap positional detectors (board geometry only, no engine) ──────────────
// These exist to replace filler like "pierdes el hilo de la posición" and
// "Capturas la torre en d4" (which describes without teaching) with something
// a coach would actually say.

// Was the capture worth it? Pure material arithmetic: if the opponent can
// recapture on that square, the trade nets (taken - mine); if not, it's a
// clean win of material.
// Static Exchange Evaluation — the standard way engines answer "is this
// capture actually good?". It plays out the WHOLE capture chain on the square,
// each side always taking with its least valuable attacker, then minimaxes
// back (either side may stop when continuing would lose material).
//
// Looking only one ply ahead ("can they recapture?") was wrong in a very
// common shape the player hit: rook takes rook, they retake, you retake with
// the SECOND rook and end up a rook ahead. One-ply logic called that "cambio
// parejo". Replaying with chess.js also means x-ray attackers behind the first
// one are handled for free, since legal moves are recomputed each step.
function seeAfterCapture(fenAfter: string, square: string, capturedValue: number, occupantValue: number): number {
  const gains: number[] = [capturedValue];
  const board = new Chess(fenAfter);
  let occupant = occupantValue; // value of the piece now sitting on the square
  let d = 0;
  for (;;) {
    const caps = board.moves({ verbose: true }).filter((m) => m.to === square && m.captured);
    if (caps.length === 0) break;
    caps.sort((a, b) => (PIECE_VAL[a.piece] ?? 0) - (PIECE_VAL[b.piece] ?? 0));
    const mv = caps[0];
    d++;
    gains[d] = occupant - gains[d - 1];
    occupant = PIECE_VAL[mv.piece] ?? 0;
    try { board.move(mv.san); } catch { break; }
    if (d > 12) break; // safety valve; real exchanges never run this long
  }
  for (let i = d; i > 0; i--) gains[i - 1] = -Math.max(-gains[i - 1], gains[i]);
  return gains[0];
}

function tradeVerdictFor(fenAfter: string, h: { to: string; piece: string; captured?: string }):
  "gana" | "pareja" | "pierde" | null {
  if (!h.captured) return null;
  try {
    const see = seeAfterCapture(fenAfter, h.to, PIECE_VAL[h.captured] ?? 0, PIECE_VAL[h.piece] ?? 0);
    return see > 0 ? "gana" : see === 0 ? "pareja" : "pierde";
  } catch { return null; }
}

// The piece just moved is attacked and every square it can reach is attacked
// too — it's still on the board, but it has nowhere safe to go.
function trappedPieceAfter(fenAfter: string, h: { to: string; piece: string }):
  { piece: string; square: string } | null {
  if ((PIECE_VAL[h.piece] ?? 0) < 3) return null;
  try {
    // fenAfter has the OPPONENT to move, so their captures enumerate directly.
    const after = new Chess(fenAfter);
    const attacked = new Set<string>(after.moves({ verbose: true }).filter((m) => m.captured).map((m) => m.to));
    if (!attacked.has(h.to)) return null;
    // Flip the side to move to see where our piece could run to.
    const flipped = new Chess(fenAfter.replace(/ (w|b) /, (_m, c) => (c === "w" ? " b " : " w ")));
    const escapes = flipped.moves({ square: h.to as Square, verbose: true });
    if (escapes.length === 0) return null; // pinned/blocked is a different story
    const safe = escapes.some((e) => !attacked.has(e.to));
    return safe ? null : { piece: PIECE_ES[h.piece] ?? "pieza", square: h.to };
  } catch { return null; }
}

// Classic back-rank shape: king still on its home rank, the three squares in
// front of it filled by its own pawns, and no legal king move.
function backRankBoxedIn(fenAfter: string, playerColor: "w" | "b"): boolean {
  try {
    const board = new Chess(fenAfter.replace(/ (w|b) /, () => ` ${playerColor} `));
    const homeRank = playerColor === "w" ? "1" : "8";
    const pawnRank = playerColor === "w" ? "2" : "7";
    let kingSq: string | null = null;
    for (const row of board.board()) {
      for (const sq of row) {
        if (sq && sq.type === "k" && sq.color === playerColor) kingSq = sq.square;
      }
    }
    if (!kingSq || kingSq[1] !== homeRank) return false;
    if (board.moves({ square: kingSq as Square, verbose: true }).length > 0) return false;
    const file = kingSq.charCodeAt(0) - 97;
    let shield = 0;
    for (const df of [-1, 0, 1]) {
      const f = file + df;
      if (f < 0 || f > 7) continue;
      const p = board.get((String.fromCharCode(97 + f) + pawnRank) as Square);
      if (p && p.type === "p" && p.color === playerColor) shield++;
    }
    return shield >= 2;
  } catch { return false; }
}

// Positional signals for the mover, picked by diagnosing which real moves were
// falling through to the wildcard templates in two analysed games: pawn moves
// in front of the castled king, retreats, and knights to the rim. Note this is
// piece-specific on purpose — a rook on the h-file is normal play, a knight
// there is not.
function positionalFlags(
  h: { piece: string; from: string; to: string; captured?: string },
  moverWhite: boolean,
  fenAfter: string,
  prevTo: string | null,
  history: { piece: string; from: string; to: string }[],
  idx: number,
): {
  weakensKingShield: boolean; retreats: boolean; knightToRim: boolean; givesKingLuft: boolean;
  rookToOpenFile: boolean; rookToSeventh: boolean; doublesRooks: boolean; fianchetto: boolean;
  isRecapture: boolean; kingToCenter: boolean; allowsEnPassant: boolean; movesPieceTwice: boolean;
  queenOutEarly: boolean; pawnBreak: boolean; attacksBigger: string | null;
  knightToCenter: boolean; rookToSemiOpen: boolean; supportsPawnChain: boolean; outpost: boolean;
} {
  const fromRank = Number(h.from[1]), toRank = Number(h.to[1]);
  const forward = moverWhite ? toRank > fromRank : toRank < fromRank;
  const homePawnRank = moverWhite ? 2 : 7;
  const me: "w" | "b" = moverWhite ? "w" : "b";
  const file = h.to[0];

  let rookToOpenFile = false, doublesRooks = false, semiOpen = false, heavyPieces = 0;
  let allowsEnPassant = false, pawnBreak = false, attacksBigger: string | null = null;
  let undevelopedMinors = 0;
  try {
    const b = new Chess(fenAfter);
    if (h.piece === "r") {
      const pawnsOnFile = b.board().flat().filter((sq) => sq && sq.type === "p" && sq.square[0] === file);
      rookToOpenFile = pawnsOnFile.length === 0;
      // Semi-open = none of YOUR pawns, but the opponent still has one to press.
      semiOpen = !rookToOpenFile && pawnsOnFile.every((sq) => sq!.color !== me);
      // Another friendly rook/queen already on the same file.
      doublesRooks = b.board().some((row) =>
        row.some((sq) => sq && sq.color === me && (sq.type === "r" || sq.type === "q")
          && sq.square[0] === file && sq.square !== h.to));
    }
    for (const row of b.board()) {
      for (const sq of row) {
        if (!sq) continue;
        if (sq.type === "q" || sq.type === "r" || sq.type === "b" || sq.type === "n") heavyPieces++;
        // Minor still sitting on its starting square.
        if ((sq.type === "b" || sq.type === "n") && sq.color === me
          && sq.square[1] === String(moverWhite ? 1 : 8)) undevelopedMinors++;
      }
    }

    // fenAfter has the OPPONENT to move, so their legal moves list directly
    // answers "can they take this en passant?".
    if (h.piece === "p" && Math.abs(toRank - fromRank) === 2) {
      allowsEnPassant = b.moves({ verbose: true }).some((m) => m.flags.includes("e"));
    }

    // What OUR piece now hits: flip the side to move and read its moves from
    // the landing square. Same trick trappedPieceAfter uses.
    const flipped = new Chess(fenAfter.replace(/ (w|b) /, (_m, c) => (c === "w" ? " b " : " w ")));
    const hits = flipped.moves({ square: h.to as Square, verbose: true }).filter((m) => m.captured);
    if (h.piece === "p" && !h.captured) {
      pawnBreak = hits.some((m) => m.captured === "p");
    }
    const mine = PIECE_VAL[h.piece] ?? 0;
    const biggest = hits
      .map((m) => m.captured!)
      .filter((c) => (PIECE_VAL[c] ?? 0) > mine)
      .sort((a, b2) => (PIECE_VAL[b2] ?? 0) - (PIECE_VAL[a] ?? 0))[0];
    // Only worth saying when the move CREATED the threat, not when the piece
    // just captured something (that already has its own comment).
    if (biggest && !h.captured) attacksBigger = PIECE_ES[biggest] ?? null;
  } catch { /* ignore */ }

  // Pawn-chain support and outposts. Both are read off the board after the
  // move: whether the pawn that just moved now protects a friendly pawn, and
  // whether a minor landed on a square no enemy pawn can ever challenge.
  let supportsPawnChain = false, outpost = false;
  try {
    const b = new Chess(fenAfter);
    const toFile = h.to.charCodeAt(0) - 97;
    const fwd = moverWhite ? 1 : -1;
    const at = (fIdx: number, r: number) =>
      fIdx < 0 || fIdx > 7 || r < 1 || r > 8 ? null : b.get((String.fromCharCode(97 + fIdx) + r) as Square);

    if (h.piece === "p") {
      // The pawn defends whatever sits diagonally in front of it.
      supportsPawnChain = [-1, 1].some((df) => {
        const p = at(toFile + df, toRank + fwd);
        return !!p && p.type === "p" && p.color === me;
      });
    }

    if ((h.piece === "n" || h.piece === "b") && (moverWhite ? toRank >= 4 && toRank <= 6 : toRank >= 3 && toRank <= 5)) {
      const defendedByPawn = [-1, 1].some((df) => {
        const p = at(toFile + df, toRank - fwd);
        return !!p && p.type === "p" && p.color === me;
      });
      // No enemy pawn on an adjacent file that could still advance to kick it.
      const kickable = [-1, 1].some((df) => {
        for (let r = toRank + fwd; r >= 1 && r <= 8; r += fwd) {
          const p = at(toFile + df, r);
          if (p && p.type === "p" && p.color !== me) return true;
        }
        return false;
      });
      outpost = defendedByPawn && !kickable;
    }
  } catch { /* ignore */ }

  // Opening-principle checks. Both are only true while the opening is still
  // being played — moving a piece twice is perfectly normal later on.
  const inOpening = idx < 24 && undevelopedMinors >= 2;
  let movedFrom = false;
  for (let k = idx - 2; k >= 0; k -= 2) {
    if (history[k].to === h.from) { movedFrom = true; break; }
  }

  return {
    weakensKingShield:
      h.piece === "p" && fromRank === homePawnRank && ["a", "b", "c", "f", "g", "h"].includes(h.from[0]),
    retreats: h.piece !== "p" && h.piece !== "k" && !forward && fromRank !== toRank,
    knightToRim: h.piece === "n" && (file === "a" || file === "h"),
    // A king step along its own back rank is the classic "make luft" move.
    givesKingLuft: h.piece === "k" && fromRank === toRank,
    rookToOpenFile: rookToOpenFile && !doublesRooks,
    rookToSeventh: h.piece === "r" && toRank === (moverWhite ? 7 : 2),
    doublesRooks,
    fianchetto: h.piece === "b" && [`b${moverWhite ? 2 : 7}`, `g${moverWhite ? 2 : 7}`].includes(h.to),
    isRecapture: prevTo != null && prevTo === h.to,
    // Centralising the king is CORRECT in an endgame, so only flag it while
    // there's still real material on the board.
    kingToCenter: h.piece === "k" && heavyPieces >= 6 && ["c", "d", "e", "f"].includes(file)
      && (moverWhite ? toRank >= 3 : toRank <= 6),
    allowsEnPassant,
    // A capture or a check is a reason to move the same piece again, so those
    // don't count as wasting a tempo.
    movesPieceTwice: inOpening && movedFrom && h.piece !== "p" && h.piece !== "k" && !h.captured,
    queenOutEarly: inOpening && h.piece === "q" && h.from === `d${moverWhite ? 1 : 8}`,
    pawnBreak,
    attacksBigger,
    knightToCenter: h.piece === "n" && ["d4", "e4", "d5", "e5"].includes(h.to),
    rookToSemiOpen: semiOpen && !doublesRooks,
    supportsPawnChain,
    outpost,
  };
}

// Facts read off the board with the attack table, the pawn-structure reader and
// the eval-term decomposition. Grouped in one helper because both comment tiers
// need exactly the same set, and last time they drifted apart the deep tier —
// the one covering the WORST moves — silently lost its positional vocabulary.
function boardReadingFacts(fenBefore: string, fenAfter: string, moverWhite: boolean) {
  const me = moverWhite ? "w" : "b";
  try {
    const ud = underDefended(fenAfter, me)
      .sort((a, b) => (PIECE_VAL[b.type] ?? 0) - (PIECE_VAL[a.type] ?? 0))[0];
    const ov = overloadedDefender(fenAfter, me);
    const dom = dominantChange(fenBefore, fenAfter, me);
    return {
      underDefended: ud ? { piece: PIECE_ES[ud.type] ?? "pieza", square: ud.square } : null,
      overloaded: ov ? { piece: PIECE_ES[ov.piece] ?? "pieza", count: ov.duties.length } : null,
      structure: structureChange(fenBefore, fenAfter, me),
      dominantTerm: dom ? { term: dom.term, delta: dom.delta } : null,
      theirKingWorse: pressureOnOpponent(fenBefore, fenAfter, me).theirKingWorse,
    };
  } catch {
    // A malformed FEN must never cost the move its comment — the rest of the
    // facts are still perfectly good on their own.
    return { underDefended: null, overloaded: null, structure: null, dominantTerm: null, theirKingWorse: false };
  }
}

// Two-pass analysis:
//  Pass 1 — a fast shallow sweep over EVERY position to find where the errors are.
//  Pass 2 — a DEEP re-evaluation of only those few error positions (and the move
//           before), so the important moments get strong analysis without paying
//           the deep cost on all ~70 positions. Concentrates CPU where it matters.
const SHALLOW_DEPTH = 8;
const DEEP_DEPTH = 12;      // deep enough to be reliable, short enough not to freeze the free-tier CPU
const MAX_DEEP_MOVES = 8;   // cap how many error positions we deepen

function classify(centipawnLoss: number): MoveClassification {
  if (centipawnLoss < 10) return "best";
  if (centipawnLoss < 25) return "excellent";
  if (centipawnLoss < 50) return "good";
  if (centipawnLoss < 100) return "inaccuracy";
  if (centipawnLoss < 200) return "mistake";
  return "blunder";
}

// Converts a side-to-move score (pawns) at ply i to white's perspective.
const toWhite = (score: number, i: number) => (i % 2 === 1 ? score : -score);

export async function analyzeGame(
  gameId: string,
  pgn: string,
  onProgress?: (done: number, total: number, label?: string) => void,
): Promise<void> {
  const chess = new Chess();

  try {
    chess.loadPgn(pgn);
  } catch {
    return;
  }

  const history = chess.history({ verbose: true });
  chess.reset();

  // Build FEN list for every position after each move
  const fens: string[] = [];
  for (const move of history) {
    chess.move(move.san);
    fens.push(chess.fen());
  }

  // ── Pass 1: shallow sweep over every position ──────────────────────────────
  const evals = await analyzeAllFens(fens, SHALLOW_DEPTH, (d, t) => onProgress?.(d, t, "Evaluando cada posición…"));

  // Stockfish reports `score cp` from the SIDE-TO-MOVE perspective (UCI standard).
  // Convert to WHITE's perspective so the stored eval is consistent everywhere.
  const whiteEval: (number | null)[] = evals.map((r, i) => (r ? toWhite(r.score, i) : null));

  // Builds the moves array (loss + classification) from the current whiteEval.
  // `ply` (the absolute 0-indexed move index) is the only unbiased per-row
  // key — move_number+SAN collides whenever both colors play the same SAN
  // at the same move_number (e.g. a recapture), which used to silently
  // attach one ply's data to the wrong one downstream.
  const buildMoves = (): Omit<Move, "id">[] =>
    history.map((move, i) => {
      // A move that delivers checkmate is the best possible outcome — never an
      // error. Engine eval at the terminal position can flip sign and misclassify
      // it as a blunder, so short-circuit here.
      if (move.san.includes("#")) {
        const whiteMated = i % 2 === 0;
        return { game_id: gameId, ply: i, move_number: Math.floor(i / 2) + 1, move: move.san, evaluation: whiteMated ? 9999 : -9999, centipawn_loss: 0, classification: "best" };
      }
      const cur = whiteEval[i];
      if (cur === null) {
        return { game_id: gameId, ply: i, move_number: Math.floor(i / 2) + 1, move: move.san, evaluation: null, centipawn_loss: null, classification: null };
      }
      const prev = i === 0 ? 0 : whiteEval[i - 1];
      const whiteJustMoved = i % 2 === 0;
      let centipawnLoss = 0;
      if (prev !== null) {
        const drop = whiteJustMoved ? prev - cur : cur - prev;
        centipawnLoss = Math.min(2000, Math.max(0, Math.round(drop * 100)));
      }
      return { game_id: gameId, ply: i, move_number: Math.floor(i / 2) + 1, move: move.san, evaluation: cur, centipawn_loss: centipawnLoss, classification: classify(centipawnLoss) };
    });

  // ── Pass 2: deepen the worst positions ──────────────────────────────────────
  // Blunders/mistakes always get priority, but "inaccuracy" moves now compete
  // for any remaining slots too. Reason: a shallow (depth 8) search in a
  // genuinely complex/sharp position can misjudge a move as merely a minor
  // inaccuracy when a deeper look would show it was actually much worse — and
  // since pass 1 only flagged blunders/mistakes for a deeper look, that error
  // was never caught. This under-detection systematically deflates ACPL (and
  // therefore inflates the "Elo estimado") specifically in complex games,
  // which is exactly the failure mode reported ("en partidas complejas me
  // calificas con el de 2000").
  const prelim = buildMoves();
  const severityRank = (cls: string | null) => cls === "blunder" ? 0 : cls === "mistake" ? 1 : 2;
  const errorIdx = prelim
    .map((m, i) => ({ i, loss: m.centipawn_loss ?? 0, cls: m.classification }))
    .filter((m) => m.cls === "blunder" || m.cls === "mistake" || m.cls === "inaccuracy")
    .sort((a, b) => {
      const rankDiff = severityRank(a.cls) - severityRank(b.cls);
      return rankDiff !== 0 ? rankDiff : b.loss - a.loss;
    })
    .slice(0, MAX_DEEP_MOVES)
    .map((m) => m.i);

  // Re-evaluate each error position AND the one before it (the loss needs both).
  const deepIdx = new Set<number>();
  for (const i of errorIdx) { deepIdx.add(i); if (i > 0) deepIdx.add(i - 1); }

  for (const i of deepIdx) {
    try {
      const r = await evaluatePosition(fens[i], DEEP_DEPTH);
      whiteEval[i] = toWhite(r.score, i);
    } catch { /* keep the shallow value */ }
  }

  const moves = buildMoves();
  if (moves.length === 0) return;

  // ── Highlight brilliant / great moves (chess.com style) ────────────────────
  // Only upgrade moves that were already "best". A brilliant is a sound
  // sacrifice; a great is a strong best move that wins a clean piece.
  const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  for (let i = 0; i < history.length; i++) {
    if (moves[i].classification !== "best") continue;
    const h = history[i];
    const moverWhite = i % 2 === 0;
    const evalAfter = whiteEval[i] == null ? 0 : (moverWhite ? whiteEval[i]! : -whiteEval[i]!);
    const evalBefore = i === 0 ? 0 : (whiteEval[i - 1] == null ? 0 : (moverWhite ? whiteEval[i - 1]! : -whiteEval[i - 1]!));
    if (evalAfter < -0.5) continue;               // must stay sound
    if (Math.abs(evalAfter) >= 9000) continue;    // ignore forced-mate lines

    const movedVal = VAL[h.piece] ?? 0;
    const capturedVal = h.captured != null ? (VAL[h.captured] ?? 0) : 0;
    // Sacrifice: a cheaper enemy piece can capture the piece we just moved,
    // yet the engine still rates this the best move → brilliant. Requires
    // `capturedVal < movedVal` — i.e. this move is a NET material loss (or
    // gives away a piece for nothing) — otherwise a plain even trade (e.g.
    // bishop takes knight, pawn recaptures: capturedVal 3 == movedVal 3)
    // was wrongly flagged brilliant just because the recapturer was cheap.
    let brilliant = false;
    if (movedVal >= 3 && capturedVal < movedVal && evalBefore <= 4.5) {
      try {
        const c = new Chess(fens[i]);
        const caps = c.moves({ verbose: true }).filter((x) => x.to === h.to && x.captured);
        if (caps.length && Math.min(...caps.map((x) => VAL[x.piece] ?? 99)) < movedVal) brilliant = true;
      } catch { /* ignore */ }
    }
    if (brilliant) { moves[i].classification = "brilliant"; continue; }

    // Great: best move that wins a clean piece (not a mere recapture) with a strong swing.
    const wonPiece = h.captured != null && (VAL[h.captured] ?? 0) >= 3;
    const isRecapture = i > 0 && history[i - 1].captured != null && history[i - 1].to === h.to;
    if (wonPiece && !isRecapture && evalAfter - evalBefore >= 1.5) {
      moves[i].classification = "great";
    }
  }

  // "best"/"excellent" moves that directly punish the OPPONENT's immediately
  // preceding blunder/mistake — worth a congratulatory comment instead of
  // silence, without relabeling the classification itself. Based on the
  // already-finalized classification labels (deterministic) rather than a
  // fresh eval-swing threshold: the swing from a blunder happens AT the
  // blunder ply itself, not necessarily at the reply that punishes it, so a
  // swing-based check on the reply's own ply unreliably misses this case.
  const punishingBest = new Set<number>();
  for (let i = 1; i < history.length; i++) {
    const cls = moves[i].classification;
    if (cls !== "best" && cls !== "excellent") continue;
    const prevCls = moves[i - 1].classification;
    if (prevCls === "blunder" || prevCls === "mistake") punishingBest.add(i);
  }

  await supabase.from("moves").delete().eq("game_id", gameId);
  {
    const { error } = await supabase.from("moves").insert(moves.map((m) => ({ ...m })));
    // `ply` may not exist yet on databases that haven't run the migration —
    // degrade gracefully instead of failing the whole analysis pass.
    if (error) {
      await supabase.from("moves").insert(moves.map(({ ply: _ply, ...rest }) => rest));
    }
  }

  const analyzed = moves.filter((m) => m.centipawn_loss !== null);
  const blunders    = analyzed.filter((m) => m.classification === "blunder").length;
  const mistakes    = analyzed.filter((m) => m.classification === "mistake").length;
  const inaccuracies = analyzed.filter((m) => m.classification === "inaccuracy").length;
  const total = analyzed.length;

  const accuracy =
    total > 0
      ? Math.max(
          0,
          Math.round(
            (1 - (blunders * 3 + mistakes * 2 + inaccuracies) / (total * 3)) * 100 * 10
          ) / 10
        )
      : null;

  await supabase.from("games").update({ accuracy }).eq("id", gameId);

  // ── Pass 3: coach comments for the moves that matter ───────────────────────
  // Engine facts (best move, punishment line, verified motifs) composed into a
  // short sentence by lib/coachComment.ts and persisted to moves.explanation.
  // No API key needed and no network call — so this can never be skipped or
  // rate-limited the way the old Groq path could.

  // BOTH colours get commented. Every comment is written as advice to whoever
  // made the move, so the same templates work for the opponent unchanged — the
  // viewer just labels those "Tu oponente". Seeing the opponent's play judged
  // by the same standard is what lets the player draw their own conclusions,
  // and it's how chess.com's review reads too.
  const notable = moves
    .map((m, i) => ({ i, cls: m.classification, loss: m.centipawn_loss ?? 0 }))
    .filter((m) => (m.cls && EXPLAIN_CLASSES.has(m.cls)) || punishingBest.has(m.i))
    // Skip trivial inaccuracies (e.g. +3.5→+3.0): a comment there is just noise.
    .filter((m) => m.cls !== "inaccuracy" || m.loss >= 80);
  const weight: Record<string, number> = { blunder: 5, mistake: 4, brilliant: 4, great: 3, inaccuracy: 1 };
  const chosen = notable
    .sort((a, b) => {
      const wa = punishingBest.has(a.i) ? 2 : (weight[a.cls!] ?? 0);
      const wb = punishingBest.has(b.i) ? 2 : (weight[b.cls!] ?? 0);
      return (wb - wa) || (b.loss - a.loss);
    })
    .slice(0, MAX_EXPLAIN)
    .map((m) => m.i)
    .sort((a, b) => a - b);

  for (let k = 0; k < chosen.length; k++) {
    const i = chosen[k];
    onProgress?.(k, chosen.length, "Escribiendo el análisis del coach…");
    const fenBefore = i === 0 ? new Chess().fen() : fens[i - 1];
    const moverWhite = i % 2 === 0;
    const evalAfter = whiteEval[i] == null ? 0 : (moverWhite ? whiteEval[i]! : -whiteEval[i]!);
    const evalBefore = i === 0 ? 0 : (whiteEval[i - 1] == null ? 0 : (moverWhite ? whiteEval[i - 1]! : -whiteEval[i - 1]!));
    // "best"-but-punishing moves get the same celebratory framing as
    // brilliant/great — they deserve credit for capitalizing on the
    // opponent's error, not silence just because the label stayed "best".
    const good = moves[i].classification === "brilliant" || moves[i].classification === "great" || punishingBest.has(i);

    // Helper: turn a UCI line into readable SAN from a position.
    const pvToSan = (fromFen: string, pv: string[]): string[] => {
      const c = new Chess(fromFen);
      const out: string[] = [];
      for (const uci of pv) {
        try {
          const mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || "q" });
          if (!mv) break;
          out.push(mv.san);
        } catch { break; }
      }
      return out;
    };

    const h = history[i];
    const VAL = PIECE_VAL;
    const playerColor: "w" | "b" = moverWhite ? "w" : "b";
    const movedVal = VAL[h.piece] ?? 0;
    const capturedVal = h.captured ? (VAL[h.captured] ?? 0) : 0;
    const movedName = PIECE_ES[h.piece] ?? "pieza";
    const capturedName = h.captured ? (PIECE_ES[h.captured] ?? "pieza") : null;

    // Deep multi-line engine analysis from BEFORE the move: the best line +
    // alternatives. Deeper than the sweep (quality for the coach).
    // MultiPV 3 (was 2): the 2nd/3rd lines are what make "era la única jugada
    // buena" a verifiable fact instead of a guess — same search, negligible
    // extra cost.
    let lines: { mate: number | null; scoreCp: number | null; pv: string[] }[] = [];
    try { lines = await getTopLines(fenBefore, EXPLAIN_DEPTH, 3); } catch { /* ignore */ }
    const mainSans = lines[0] ? pvToSan(fenBefore, lines[0].pv) : [];
    const bestSan = mainSans[0] ?? null;

    // "Only good move": the best line is decisively better than the 2nd best.
    // Scores are side-to-move (the mover), so a big positive gap = everything
    // else drops off a cliff.
    const cpOf = (l: { mate: number | null; scoreCp: number | null } | undefined) =>
      l == null ? null : l.mate != null ? (l.mate > 0 ? 100000 - l.mate : -100000 - l.mate) : l.scoreCp;
    const c0 = cpOf(lines[0]), c1 = cpOf(lines[1]);
    const onlyGoodMove = c0 != null && c1 != null && c0 - c1 >= 150;

    // Sacrifice: can the OPPONENT recapture the moved piece with something cheaper?
    let cheapestRecapture: number | null = null;
    try {
      const after = new Chess(fens[i]);
      const recaps = after.moves({ verbose: true }).filter((x) => x.to === h.to && x.captured);
      if (recaps.length) cheapestRecapture = Math.min(...recaps.map((x) => VAL[x.piece] ?? 99));
    } catch { /* ignore */ }
    const isSacrifice = cheapestRecapture != null && (capturedVal - movedVal) < 0;

    // Deterministic double attack: with the turn flipped back to the mover, how
    // many valuable enemy pieces does the just-moved piece attack? (Geometric
    // fact, not an LLM guess.) Fails safely when the move gave check.
    let doubleAttack = 0;
    try {
      const flipped = fens[i].replace(/ (w|b) /, (_m, s) => (s === "w" ? " b " : " w "));
      const cc = new Chess(flipped);
      const hits = cc.moves({ square: h.to, verbose: true }).filter((x) => x.captured && (VAL[x.captured] ?? 0) >= 3);
      doubleAttack = new Set(hits.map((x) => x.to)).size;
    } catch { /* ignore */ }
    const gaveCheck = /[+#]/.test(moves[i].move);

    // ── Structured, verified facts → deterministic comment ───────────────────
    // Everything below is board geometry or engine output, never prose. The
    // wording lives in lib/coachComment.ts, which composes it into a short
    // chess.com-style sentence. No LLM in this path: templates can't invert who
    // captured whom, can't hallucinate a fork that isn't there, and can't drift
    // between rambling and telegraphic between runs.
    const toMotif = (m: { key: string; label: string; square?: string; pieceName?: string }): Motif =>
      ({ key: m.key, label: m.label, piece: m.pieceName, square: m.square });

    const rawPlayedMotifs = detectMotifs(fenBefore, moves[i].move);
    const rawBestMotifs = bestSan && bestSan !== moves[i].move ? detectMotifs(fenBefore, bestSan) : [];
    const playedSelfHang = rawPlayedMotifs.find((m) => m.key === "hangs_own");
    const playedMotifs: Motif[] = rawPlayedMotifs.filter((m) => m.key !== "hangs_own").map(toMotif);
    // A verified double attack has no motif key of its own, so surface it as one.
    if (doubleAttack >= 2) playedMotifs.push({ key: "double", label: "doble amenaza" });
    else if (gaveCheck && doubleAttack >= 1) playedMotifs.push({ key: "double", label: "doble amenaza con jaque" });

    // What the opponent's punishment line costs, and what its first move takes.
    let oppCapturesPiece: string | null = null;
    let materialLostPiece: string | null = null;
    let materialNet = 0, materialSettled = false, materialTrades = false;
    let allowsMotif: Motif | null = null;
    if (!good) {
      try {
        const opp = await getTopLines(fens[i], DEEP_DEPTH, 1);
        const oppSans = opp[0] ? pvToSan(fens[i], opp[0].pv) : [];
        if (oppSans.length) {
          const cc = new Chess(fens[i]);
          const mv = cc.moves({ verbose: true }).find((x) => x.san === oppSans[0]);
          if (mv?.captured && (VAL[mv.captured] ?? 0) >= 3) oppCapturesPiece = PIECE_ES[mv.captured] ?? null;
          const r = materialOverLine(fens[i], oppSans, playerColor);
          materialNet = r.net; materialSettled = r.settled; materialTrades = r.trades;
          if (r.biggestLostType) materialLostPiece = PIECE_ES[r.biggestLostType] ?? null;
          // Which named tactic the opponent's reply lands against us. Same
          // geometry detector, just pointed at THEIR move — this is what turns
          // "pierdes el hilo de la posición" into "permites una horquilla".
          const om = detectMotifs(fens[i], oppSans[0]).find((m) => m.key !== "hangs_own" && m.key !== "hanging");
          if (om) allowsMotif = { key: om.key, label: om.label, piece: om.pieceName, square: om.square };
        }
      } catch { /* ignore */ }
    }

    // NOTE: no "you moved a pinned piece" detector here on purpose. An
    // absolute pin makes the move illegal in the first place, so anything that
    // reached this point either moved ALONG the pin ray (perfectly fine) or
    // was only relatively pinned — which needs a material check this cheap
    // geometry pass can't do reliably. Better silent than wrong.

    // Best-move shape, for the "what was better" slot.
    let bestPiece: string | null = null, bestTo: string | null = null;
    let bestCapturedPiece: string | null = null, bestGivesCheck = false;
    let bestIsCastle = false, bestIsCenterPawn = false, bestDefendsHung = false;
    if (bestSan && bestSan !== moves[i].move) {
      bestIsCastle = bestSan.startsWith("O-O");
      try {
        const cb = new Chess(fenBefore);
        const bmv = cb.move(bestSan);
        if (bmv) {
          bestPiece = PIECE_ES[bmv.piece] ?? null;
          bestTo = bmv.to;
          if (bmv.captured) bestCapturedPiece = PIECE_ES[bmv.captured] ?? null;
          bestGivesCheck = /[+#]/.test(bmv.san);
          bestIsCenterPawn = bmv.piece === "p" && ["d4", "e4", "d5", "e5"].includes(bmv.to);
          // The best move "defends" the hung piece if playing it doesn't leave
          // anything of ours undefended, while the played move did.
          if (playedSelfHang) bestDefendsHung = !rawBestMotifs.some((m) => m.key === "hangs_own");
        }
      } catch { /* ignore */ }
    }

    const text = composeCoachComment({
      variantSeed: i,
      playedPiece: movedName,
      playedTo: h.to,
      isMate: /#/.test(moves[i].move),
      capturedPiece: capturedName,
      classification: moves[i].classification,
      good,
      evalBefore, evalAfter,
      bestPiece, bestTo, bestCapturedPiece, bestGivesCheck, bestIsCastle,
      bestIsCenterPawn, bestDefendsHung,
      onlyGoodMove,
      missedForcedMate: !good && lines[0]?.mate != null && (lines[0].mate ?? 0) > 0,
      selfHang: playedSelfHang?.pieceName && playedSelfHang.square
        ? { piece: playedSelfHang.pieceName, square: playedSelfHang.square }
        : null,
      playedMotifs,
      bestMotifs: rawBestMotifs.filter((m) => m.key !== "hangs_own").map(toMotif),
      materialLostPiece, materialNet, materialSettled, materialTrades,
      oppCapturesPiece,
      isSacrificeConfirmed: isSacrifice && good,
      allowsMotif,
      // The deep tier needs these too. Without them the engine-analysed moves —
      // the WORST ones, the ones the player most wants explained — were the only
      // ones that could still fall through to "pierdes el hilo", because the
      // positional signals only reached the cheap tier.
      isCastle: h.san.startsWith("O-O"),
      isPromotion: h.promotion != null,
      developsPiece: (h.piece === "n" || h.piece === "b") && /[18]$/.test(h.from),
      toCenter: ["d4", "e4", "d5", "e5"].includes(h.to),
      gaveCheck: /\+/.test(h.san),
      tradeVerdict: tradeVerdictFor(fens[i], h),
      trappedPiece: trappedPieceAfter(fens[i], h),
      backRankRisk: backRankBoxedIn(fens[i], moverWhite ? "w" : "b"),
      ...positionalFlags(h, moverWhite, fens[i], i > 0 ? history[i - 1].to : null, history, i),
      ...boardReadingFacts(i === 0 ? new Chess().fen() : fens[i - 1], fens[i], moverWhite),
    });

    if (text) {
      try {
        // Match by `ply` (unambiguous) rather than move_number+SAN, which
        // collides whenever both colors play the same SAN at the same
        // move_number (e.g. a recapture) and silently overwrote the wrong
        // row's explanation. Falls back to the old match on databases that
        // haven't run the `ply` migration yet.
        const { error } = await supabase.from("moves").update({ explanation: text })
          .eq("game_id", gameId).eq("ply", i);
        if (error) {
          await supabase.from("moves").update({ explanation: text })
            .eq("game_id", gameId).eq("move_number", moves[i].move_number).eq("move", moves[i].move);
        }
      } catch { /* column may not exist yet */ }
    }
    // Keep the event loop responsive between heavy calls on the free tier.
    await new Promise((r) => setTimeout(r, 20));
  }
  // ── Pass 4: a comment for EVERY other move of the player's ─────────────────
  // chess.com comments every move, and now that comments are deterministic
  // there's no reason not to: a quiet move needs no engine search, only the
  // shallow eval from pass 1 plus the move's own shape. Without this, stepping
  // through a game showed a good comment on ~8 moves and the terse client-side
  // fallback ("Equilibrio (+0.2).") on the other ~25, which read as if nothing
  // had changed.
  const richIdx = new Set(chosen);
  const sanHistory = history.map((m) => m.san);
  const quietUpdates: { ply: number; text: string }[] = [];
  for (let i = 0; i < history.length; i++) {
    if (richIdx.has(i)) continue;
    const h = history[i];
    const fenBefore = i === 0 ? new Chess().fen() : fens[i - 1];
    const moverWhite = i % 2 === 0;
    const evalAfter = whiteEval[i] == null ? 0 : (moverWhite ? whiteEval[i]! : -whiteEval[i]!);
    const evalBefore = i === 0 ? 0 : (whiteEval[i - 1] == null ? 0 : (moverWhite ? whiteEval[i - 1]! : -whiteEval[i - 1]!));
    const rawMotifs = detectMotifs(fenBefore, moves[i].move);
    const selfHang = rawMotifs.find((m) => m.key === "hangs_own");
    const text = composeCoachComment({
      variantSeed: i,
      playedPiece: PIECE_ES[h.piece] ?? "pieza",
      playedTo: h.to,
      isMate: /#/.test(moves[i].move),
      capturedPiece: h.captured ? (PIECE_ES[h.captured] ?? null) : null,
      classification: moves[i].classification,
      good: false,
      evalBefore, evalAfter,
      // No engine data at this tier — that's the point.
      bestPiece: null, bestTo: null, bestCapturedPiece: null, bestGivesCheck: false,
      bestIsCastle: false, bestIsCenterPawn: false, bestDefendsHung: false,
      onlyGoodMove: false, missedForcedMate: false,
      selfHang: selfHang?.pieceName && selfHang.square ? { piece: selfHang.pieceName, square: selfHang.square } : null,
      playedMotifs: rawMotifs.filter((m) => m.key !== "hangs_own").map((m) => ({ key: m.key, label: m.label, piece: m.pieceName, square: m.square })),
      bestMotifs: [],
      materialLostPiece: null, materialNet: 0, materialSettled: false, materialTrades: false,
      oppCapturesPiece: null, isSacrificeConfirmed: false,
      isCastle: h.san.startsWith("O-O"),
      isPromotion: h.promotion != null,
      developsPiece: (h.piece === "n" || h.piece === "b") && /[18]$/.test(h.from),
      toCenter: ["d4", "e4", "d5", "e5"].includes(h.to),
      gaveCheck: /\+/.test(h.san),
      // The opening book already existed for the viewer's 📖 badge but was
      // never used for commentary — so four consecutive theory moves each got
      // "sacas la pieza y ganas actividad".
      isBook: isBookMove(sanHistory, i),
      tradeVerdict: tradeVerdictFor(fens[i], h),
      trappedPiece: trappedPieceAfter(fens[i], h),
      backRankRisk: backRankBoxedIn(fens[i], moverWhite ? "w" : "b"),
      ...positionalFlags(h, moverWhite, fens[i], i > 0 ? history[i - 1].to : null, history, i),
      ...boardReadingFacts(i === 0 ? new Chess().fen() : fens[i - 1], fens[i], moverWhite),
    });
    if (text) quietUpdates.push({ ply: i, text });
  }
  // Write in small concurrent batches — one round-trip per move would add ~25
  // sequential requests to every analysis.
  for (let k = 0; k < quietUpdates.length; k += 8) {
    await Promise.all(quietUpdates.slice(k, k + 8).map(async ({ ply, text }) => {
      try {
        const { error } = await supabase.from("moves").update({ explanation: text }).eq("game_id", gameId).eq("ply", ply);
        if (error) {
          await supabase.from("moves").update({ explanation: text })
            .eq("game_id", gameId).eq("move_number", moves[ply].move_number).eq("move", moves[ply].move);
        }
      } catch { /* column may not exist yet */ }
    }));
  }

  onProgress?.(chosen.length, chosen.length, "Análisis completado");
}
