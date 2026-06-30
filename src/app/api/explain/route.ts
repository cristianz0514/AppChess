import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Concise, coach-style explanation of a single critical moment.
// Kept short and high-level on purpose — it reasons from the position + the
// evaluation swing, not deep tactics, so it stays fast and avoids hallucination.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.san || !body?.fenBefore) {
    return NextResponse.json({ error: "missing data" }, { status: 400 });
  }

  const { fenBefore, san, moveNumber, evalBefore, evalAfter, phase } = body;

  const prompt = `Eres un entrenador de ajedrez blitz de alto rendimiento. Explica en español, en MÁXIMO 2 frases cortas, por qué esta jugada fue un error y qué debió considerar el jugador.

Posición (FEN) antes de la jugada: ${fenBefore}
Jugada jugada: ${moveNumber}. ${san}
Evaluación antes (perspectiva del jugador): ${typeof evalBefore === "number" ? evalBefore.toFixed(1) : "?"}
Evaluación después: ${typeof evalAfter === "number" ? evalAfter.toFixed(1) : "?"}
Fase: ${phase}

Reglas:
- Tono de entrenador directo, NO robótico, sin jerga sin explicar.
- Conecta el error con una IDEA concreta (dejó una pieza, perdió la iniciativa, abrió su rey, etc.).
- NO inventes variantes largas ni jugadas específicas que no puedas verificar; habla del concepto.
- Máximo 2 frases. Solo el texto, sin comillas ni encabezados.`;

  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 160,
    });
    const text = res.choices[0]?.message?.content?.trim() ?? "";
    if (!text) return NextResponse.json({ error: "no text" }, { status: 502 });
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: "coach unavailable" }, { status: 500 });
  }
}
