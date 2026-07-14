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

  // How big was the swing, in plain pawn-equivalents — gives the model a
  // concrete magnitude to reach for instead of just parroting the raw evals.
  const swing = typeof evalBefore === "number" && typeof evalAfter === "number"
    ? Math.abs(evalBefore - evalAfter) : null;
  const swingLine = swing != null
    ? swing >= 9000 ? "Esta jugada deja escapar un mate forzado." : `La ventaja cambió en unos ${swing.toFixed(1)} peones.`
    : "";

  // Rule-based tactical-pattern detection (real board geometry, not the
  // model guessing) — grounds the coach's vocabulary in the standard Spanish
  // terms (horquilla, clavada, ataque descubierto) instead of vague language,
  // and only when a pattern is ACTUALLY there to name.
  //
  // fork/pin/skewer/discovered/hanging all describe a threat the MOVER
  // creates against the OPPONENT — they're never a self-inflicted problem,
  // so a hit on the student's own move is not blame-worthy and must not be
  // read as "why the move was bad". hangs_own is the opposite direction
  // (the mover's own piece left undefended) and is the one genuine
  // self-caused-problem signal — split it out so the prompt can't conflate
  // the two.
  const playedMotifs = detectMotifs(fenBefore, san);
  const bestMotifs = bestMove ? detectMotifs(fenBefore, bestMove) : [];
  const playedSelfHang = playedMotifs.find((m) => m.key === "hangs_own");
  const playedThreats = playedMotifs.filter((m) => m.key !== "hangs_own");
  const bestThreats = bestMotifs.filter((m) => m.key !== "hangs_own");
  // Name the exact piece/square whenever we have one — otherwise the model
  // has to guess which piece is involved, and it reliably guesses wrong
  // (e.g. blaming the piece that just moved when a DIFFERENT piece is the
  // one actually left hanging).
  const motifLine = [
    playedSelfHang ? `La jugada del alumno (${san}) deja su ${playedSelfHang.pieceName} en ${playedSelfHang.square} sin ningún defensor (pieza propia colgada) — esta SÍ es un problema causado por su jugada, y esa es la pieza y casilla exactas, no otra.` : null,
    bestThreats.length ? `La mejor jugada (${bestMove}) logra: ${bestThreats.map((m) => `${m.label}${m.square ? ` (sobre el ${m.pieceName} en ${m.square})` : ""}`).join(", ")} — esto es lo que el alumno dejó pasar.` : null,
    playedThreats.length ? `Nota aparte (NO es la causa del error, es solo información): la jugada del alumno también genera ${playedThreats.map((m) => m.label).join(", ")} contra el rival.` : null,
  ].filter(Boolean).join(" ");

  const prompt = `Eres el entrenador virtual de un jugador de club, dentro de la revisión de su partida — el mismo momento en que Chess.com muestra a su "Coach" explicando por qué una jugada fue buena o mala. Escribe en español, con la voz de un coach real: directa, cercana, en frases completas y naturales — nunca un volcado de datos ni fragmentos cortados.

Ejemplo del estilo esperado (tema distinto, solo para calibrar tono y longitud — no copies estas palabras ni esta idea):
"Cxd7 abre la columna e y deja tu rey expuesto a un jaque directo. Con Bg5 mantenías la clavada sobre el caballo y una posición mucho más sólida."

Ahora los datos reales de esta jugada:
Posición (FEN): ${fenBefore}
Jugada del alumno: ${moveNumber}. ${san}
Mejor jugada según Stockfish: ${bestMove ?? "(desconocida)"}
Evaluación antes (perspectiva del alumno): ${fmt(evalBefore)}
Evaluación después de su jugada: ${fmt(evalAfter)}
${swingLine}
Fase: ${phase}
${motifLine ? `Patrones tácticos verificados (detectados por análisis de tablero, NO los inventes ni uses otros distintos a estos): ${motifLine}` : "No se detectó ningún patrón táctico estándar (horquilla/clavada/pincho/descubierta/pieza colgada/pieza propia colgada) en esta jugada — no menciones ninguno."}

Escribe 2 frases completas (no fragmentos), cada una de entre 10 y 20 palabras:
- Primero decide CUÁL de estos casos aplica, según lo verificado arriba (en este orden de prioridad): (a) "pieza propia colgada" verificada → ESA es la causa real: la jugada del alumno deja su propia pieza sin defensa, dilo así directamente. (b) si no hay pieza propia colgada pero SÍ hay algo verificado en "la mejor jugada" → el problema de ${san} es que no vio/jugó esa táctica que sí estaba disponible ("no aprovechaste...", "dejaste pasar..."). (c) si no hay ningún patrón verificado en ninguno de los dos casos anteriores → elige la categoría posicional que de verdad aplica (seguridad del rey / una casilla o diagonal clave / desarrollo / tiempo / estructura de peones), pero solo si es real, nunca inventada. La "nota aparte" (si aparece) es solo contexto — NUNCA la uses como la causa del error.
- Frase 1: el hecho concreto según el caso que identificaste arriba — arranca nombrando la pieza, la casilla o el patrón, no con "perdiste la oportunidad de..." ni otra frase hecha.
- Frase 2: qué logra ${bestMove ?? "la mejor jugada"} en concreto que ${san} no logra — la lección puntual, no un consejo genérico de "desarrolla tus piezas" o "controla el centro" salvo que sea literalmente el punto.
- Si hay un patrón táctico verificado arriba, NÓMBRALO con esa palabra exacta — es más preciso que describirlo en general. NUNCA inventes un defecto posicional (estructura de peones, flanco de rey, etc.) que no esté respaldado por los datos de arriba.
- El número de peones de la evaluación es un dato de apoyo opcional, no el tema central — puedes omitirlo si las dos frases ya son claras sin él.
- Está bien repetir el nombre de la pieza o el patrón en ambas frases si es el mismo hecho — NO inventes un motivo nuevo (abrir el centro, mejorar la estructura, etc.) solo para que la frase 2 suene distinta.
- Prohibido: comillas, encabezados, "en esta posición", "es importante", cualquier variante o amenaza que no te haya dado arriba.`;

  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
      max_tokens: 140,
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
