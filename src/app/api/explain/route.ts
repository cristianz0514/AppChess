import { NextRequest, NextResponse } from "next/server";
import { Chess } from "chess.js";
import { supabase } from "@/lib/supabase";
import { detectMotifs } from "@/lib/tacticalMotifs";
import { composeCoachComment, type Motif } from "@/lib/coachComment";

// Comment for one critical moment, used by the story walkthrough in GameViewer.
//
// This used to ask an LLM. It no longer does, and the reason is register: every
// other comment in the app is composed from the templates in lib/coachComment,
// and a model-written sentence dropped in among them reads like a different
// person wrote it — different length, different vocabulary, different confidence.
// Consistency across one review matters more than any single sentence.
//
// In practice this route now rarely composes anything: the analysis writes a
// comment for EVERY ply, so the cache below hits. The composed path is the
// fallback for games analysed before that was true.
//
// It works from less than the full analysis has — no deep re-evaluation, no
// punishment line — so it fills only the facts it can verify and leaves the rest
// null. composeCoachComment degrades that way by design: a missing fact drops a
// clause, it never invents one.

const PIECE_ES: Record<string, string> = {
  p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey",
};

const toMotif = (m: { key: string; label: string; pieceName?: string; square?: string }): Motif =>
  ({ key: m.key, label: m.label, piece: m.pieceName, square: m.square });

// Same thresholds as the analysis pipeline's classify(), kept in centipawns so
// the two can't disagree about what counts as a mistake.
function classify(swingPawns: number): string {
  const cp = Math.abs(swingPawns) * 100;
  if (cp < 25) return "excellent";
  if (cp < 50) return "good";
  if (cp < 100) return "inaccuracy";
  if (cp < 200) return "mistake";
  return "blunder";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.san || !body?.fenBefore) {
    return NextResponse.json({ error: "missing data" }, { status: 400 });
  }

  const { fenBefore, san, bestMove, moveNumber, evalBefore, evalAfter, gameId, ply } = body;

  // 1. Cache lookup. Matching by (move_number, move) is AMBIGUOUS: White's and
  // Black's move at the same move_number can share the same SAN (both play
  // "dxe5" on a recapture), and that collision silently attached one ply's
  // explanation to the OTHER ply too. `ply` is the real key; the old match
  // remains only for games analysed before that column existed.
  if (gameId) {
    try {
      const query = supabase.from("moves").select("explanation").eq("game_id", gameId);
      const { data } = typeof ply === "number"
        ? await query.eq("ply", ply).limit(1).maybeSingle()
        : await query.eq("move_number", moveNumber).eq("move", san).limit(1).maybeSingle();
      if (data?.explanation) return NextResponse.json({ text: data.explanation, cached: true });
    } catch { /* column may not exist yet */ }
  }

  // 2. Compose from what this request can actually verify.
  let played;
  try {
    const board = new Chess(fenBefore);
    played = board.move(san);
  } catch {
    return NextResponse.json({ error: "invalid move" }, { status: 400 });
  }
  if (!played) return NextResponse.json({ error: "invalid move" }, { status: 400 });

  const rawMotifs = detectMotifs(fenBefore, san);
  const selfHang = rawMotifs.find((m) => m.key === "hangs_own");

  // Resolve the best move to a piece and square, so the alternative clause can
  // name them instead of echoing UCI coordinates at the player.
  let bestPiece: string | null = null, bestTo: string | null = null;
  let bestCapturedPiece: string | null = null, bestGivesCheck = false;
  let bestIsCastle = false, bestIsCenterPawn = false;
  let bestMotifs: Motif[] = [];
  if (bestMove) {
    try {
      const b = new Chess(fenBefore);
      const bmv = b.move(bestMove);
      if (bmv) {
        bestPiece = PIECE_ES[bmv.piece] ?? null;
        bestTo = bmv.to;
        if (bmv.captured) bestCapturedPiece = PIECE_ES[bmv.captured] ?? null;
        bestGivesCheck = /[+#]/.test(bmv.san);
        bestIsCastle = bmv.san.startsWith("O-O");
        bestIsCenterPawn = bmv.piece === "p" && ["d4", "e4", "d5", "e5"].includes(bmv.to);
        bestMotifs = detectMotifs(fenBefore, bmv.san)
          .filter((m) => m.key !== "hangs_own").map(toMotif);
      }
    } catch { /* an unparseable best move just means no alternative clause */ }
  }

  const before = typeof evalBefore === "number" ? evalBefore : 0;
  const after = typeof evalAfter === "number" ? evalAfter : 0;
  const swing = before - after;

  const text = composeCoachComment({
    variantSeed: typeof ply === "number" ? ply : moveNumber ?? 0,
    playedPiece: PIECE_ES[played.piece] ?? "pieza",
    playedTo: played.to,
    isMate: played.san.includes("#"),
    capturedPiece: played.captured ? (PIECE_ES[played.captured] ?? null) : null,
    classification: classify(swing),
    good: swing <= 0.25,
    evalBefore: before,
    evalAfter: after,
    bestPiece, bestTo, bestCapturedPiece, bestGivesCheck, bestIsCastle, bestIsCenterPawn,
    bestDefendsHung: false,
    onlyGoodMove: false,
    missedForcedMate: false,
    selfHang: selfHang?.pieceName && selfHang.square
      ? { piece: selfHang.pieceName, square: selfHang.square }
      : null,
    playedMotifs: rawMotifs.filter((m) => m.key !== "hangs_own").map(toMotif),
    bestMotifs,
    // No deep line is available here, so no material claim is made. Asserting
    // "pierdes la torre" without a verified punishment line is exactly the kind
    // of confident-but-unfounded statement this whole design exists to avoid.
    materialLostPiece: null, materialNet: 0, materialSettled: false, materialTrades: false,
    oppCapturesPiece: null,
    isSacrificeConfirmed: false,
    isCastle: played.san.startsWith("O-O"),
    isPromotion: played.promotion != null,
    developsPiece: (played.piece === "n" || played.piece === "b") && /[18]$/.test(played.from),
    toCenter: ["d4", "e4", "d5", "e5"].includes(played.to),
    gaveCheck: played.san.includes("+"),
  });

  if (!text) return NextResponse.json({ error: "sin comentario" }, { status: 404 });

  if (gameId) {
    try {
      const upd = supabase.from("moves").update({ explanation: text }).eq("game_id", gameId);
      if (typeof ply === "number") await upd.eq("ply", ply);
      else await upd.eq("move_number", moveNumber).eq("move", san);
    } catch { /* column may not exist yet */ }
  }
  return NextResponse.json({ text });
}
