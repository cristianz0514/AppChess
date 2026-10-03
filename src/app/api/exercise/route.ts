import { NextRequest, NextResponse } from "next/server";
import { Chess } from "chess.js";
import { getTopLines, EngineBusyError } from "@/services/stockfish";
import { rateLimit } from "@/lib/rateLimit";
import { isValidFen } from "@/lib/validate";

// Solution + forgiving acceptance set for one "Entrena tus errores" exercise.
// Chess positions usually have more than one good move, so accepting ONLY the
// engine's #1 would reject perfectly fine answers and frustrate. We run a
// short MultiPV search and accept any first move whose evaluation is within
// half a pawn of the best — "at least as good", not "identical to the engine".
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "exercise", 60, 60_000);
  if (limited) return limited;

  const { fen } = await req.json().catch(() => ({}));
  if (!isValidFen(fen)) {
    return NextResponse.json({ error: "fen requerido y válido" }, { status: 400 });
  }

  // Normalize a line's score to a single centipawn-comparable number from the
  // side-to-move perspective (mate = a large magnitude so it always dominates).
  const scoreOf = (l: { mate: number | null; scoreCp: number | null }) =>
    l.mate !== null ? (l.mate > 0 ? 100000 - l.mate : -100000 - l.mate) : (l.scoreCp ?? 0);

  try {
    const lines = await getTopLines(fen, 12, 3);
    const withMove = lines.filter((l) => l.pv[0]);
    if (withMove.length === 0) {
      return NextResponse.json({ error: "sin solución" }, { status: 404 });
    }

    const bestScore = scoreOf(withMove[0]);
    const chess = new Chess(fen);
    const toSanFromUci = (uci: string): string | null => {
      const c = new Chess(chess.fen());
      try {
        const mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci.slice(4, 5) : undefined });
        return mv?.san ?? null;
      } catch { return null; }
    };

    const bestUci = withMove[0].pv[0];
    const acceptable = withMove
      .filter((l) => Math.abs(scoreOf(l) - bestScore) <= 50) // within ~0.5 pawn
      .map((l) => l.pv[0].slice(0, 4)); // compare on from+to only

    return NextResponse.json({
      bestUci,
      bestSan: toSanFromUci(bestUci),
      acceptable: [...new Set(acceptable)],
    });
  } catch (err) {
    if (err instanceof EngineBusyError) return NextResponse.json({ error: "motor ocupado" }, { status: 503 });
    return NextResponse.json({ error: "motor no disponible" }, { status: 503 });
  }
}
