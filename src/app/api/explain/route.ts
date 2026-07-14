import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { supabase } from "@/lib/supabase";
import { detectMotifs } from "@/lib/tacticalMotifs";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Coach comment for a critical moment — GROUNDED in Stockfish. We give the model
// the move played, the engine's best move, and the evaluation swing, and ask it
// only to explain the difference. It interprets real engine findings rather than
// guessing the position, which keeps the comment valuable and low-hallucination.
// Cached on moves.explanation (degrades gracefully if the column is absent).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.san || !body?.fenBefore) {
    return NextResponse.json({ error: "missing data" }, { status: 400 });
  }

  const { fenBefore, san, bestMove, moveNumber, evalBefore, evalAfter, phase, gameId } = body;

  // 1. Cache lookup.
  if (gameId) {
    try {
      const { data } = await supabase
        .from("moves")
        .select("explanation")
        .eq("game_id", gameId)
        .eq("move_number", moveNumber)
        .eq("move", san)
        .limit(1)
        .maybeSingle();
      if (data?.explanation) return NextResponse.json({ text: data.explanation, cached: true });
    } catch { /* column may not exist yet */ }
  }

  const fmt = (e: unknown) =>
    typeof e === "number" ? (Math.abs(e) >= 90 ? (e > 0 ? "mate a tu favor" : "mate en tu contra") : `${e > 0 ? "+" : ""}${e.toFixed(1)}`) : "?";

  // Rule-based tactical-pattern detection (real board geometry, not the
  // model guessing) — grounds the coach's vocabulary in the standard Spanish
  // terms (horquilla, clavada, ataque descubierto) instead of vague language,
  // and only when a pattern is ACTUALLY there to name.
  const playedMotifs = detectMotifs(fenBefore, san);
  const bestMotifs = bestMove ? detectMotifs(fenBefore, bestMove) : [];
  const motifLine = [
    playedMotifs.length ? `En la jugada del alumno (${san}) se detectó: ${playedMotifs.map((m) => m.label).join(", ")}.` : null,
    bestMotifs.length ? `En la mejor jugada (${bestMove}) se detectó: ${bestMotifs.map((m) => m.label).join(", ")}.` : null,
  ].filter(Boolean).join(" ");

  const prompt = `Eres un entrenador de ajedrez blitz de alto rendimiento. Explica en español, en MÁXIMO 2 frases cortas, por qué la jugada del alumno fue peor que la del motor. NO analices la posición por tu cuenta: básate SOLO en los datos que te doy.

Posición (FEN): ${fenBefore}
Jugada del alumno: ${moveNumber}. ${san}
Mejor jugada según Stockfish: ${bestMove ?? "(desconocida)"}
Evaluación antes (perspectiva del alumno): ${fmt(evalBefore)}
Evaluación después de su jugada: ${fmt(evalAfter)}
Fase: ${phase}
${motifLine ? `Patrones tácticos verificados (detectados por análisis de tablero, NO los inventes ni uses otros distintos a estos): ${motifLine}` : "No se detectó ningún patrón táctico estándar (horquilla/clavada/descubierta) en esta jugada — no menciones ninguno."}

Reglas:
- Tono de coach directo, humano, sin jerga sin explicar.
- Explica QUÉ ganaba ${bestMove ?? "la mejor jugada"} o QUÉ concedió ${san} (iniciativa, material, seguridad del rey, actividad).
- Si te di un patrón táctico verificado, NÓMBRALO con esa palabra exacta (horquilla, clavada, ataque descubierto) — es más preciso que describirlo en general.
- NO inventes variantes largas, patrones tácticos, ni jugadas que no te di.
- Máximo 2 frases. Solo el texto, sin comillas ni encabezados.`;

  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 160,
    });
    const text = res.choices[0]?.message?.content?.trim() ?? "";
    if (!text) return NextResponse.json({ error: "no text" }, { status: 502 });

    if (gameId) {
      try {
        await supabase.from("moves").update({ explanation: text })
          .eq("game_id", gameId).eq("move_number", moveNumber).eq("move", san);
      } catch { /* column may not exist yet */ }
    }
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: "coach unavailable" }, { status: 500 });
  }
}
