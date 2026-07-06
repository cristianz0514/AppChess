import { Chess } from "chess.js";
import Groq from "groq-sdk";
import { analyzeAllFens, evaluatePosition, getBestMove, getPrincipalVariation } from "./stockfish";
import { supabase } from "@/lib/supabase";
import type { Move } from "@/types";

export type MoveClassification = Move["classification"];

// How many moves get an AI coach comment. Only the moves that matter (errors +
// brilliant/great) — the ones an expert actually reads. Bounded to keep the
// pre-view analysis window reasonable.
const MAX_EXPLAIN = 20;
const EXPLAIN_CLASSES = new Set(["blunder", "mistake", "inaccuracy", "brilliant", "great"]);

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

const fmtP = (e: number) => (Math.abs(e) >= 90 ? (e > 0 ? "mate a favor" : "mate en contra") : `${e > 0 ? "+" : ""}${e.toFixed(1)}`);

const PIECE_ES: Record<string, string> = { p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey" };

// One short coach sentence, grounded in concrete facts (best move, sacrifice /
// captured material, eval swing) so it adds real value — not generic praise.
async function coachComment(args: {
  fenBefore: string; san: string; bestMove: string | null; moveNumber: number;
  evalBefore: number; evalAfter: number; good: boolean; facts: string;
}): Promise<string | null> {
  if (!groq) return null;
  const { fenBefore, san, bestMove, moveNumber, evalBefore, evalAfter, good, facts } = args;
  const swing = Math.abs(Math.round((evalAfter - evalBefore) * 10) / 10);
  const RULES = `Reglas estrictas: apóyate SOLO en los hechos y la evaluación dados. Puedes citar la "continuación del motor" si aparece en los hechos, pero NO inventes otras jugadas, casillas, columnas ni flancos que no estén ahí. Prioriza la IDEA ajedrecística (compensación, iniciativa, actividad de piezas, ataque al rey, mejor estructura, control del centro, tempo, material recuperado). Español, tono de entrenador humano, sin relleno. UNA sola frase, 12 a 22 palabras. Devuelve SOLO la frase, sin comillas.`;
  const prompt = good
    ? `Eres un entrenador de ajedrez de élite. Explica el VALOR de la jugada ${moveNumber}.${san}. Si los hechos dicen que es un sacrificio, explica qué tipo de compensación general justifica entregar material.
Hechos: ${facts}
Evaluación tuya: antes ${fmtP(evalBefore)}, después ${fmtP(evalAfter)}.
${RULES}`
    : `Eres un entrenador de ajedrez de élite. Explica en qué falló ${moveNumber}.${san} frente a la mejor del motor (${bestMove ?? "desconocida"}): qué concede (material, seguridad del rey, iniciativa, estructura) o qué lograba la mejor.
Hechos: ${facts}
Cambio de evaluación: ${fmtP(evalBefore)} → ${fmtP(evalAfter)} (${swing}).
${RULES}`;
  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.35,
      max_tokens: 90,
    });
    let text = res.choices[0]?.message?.content?.trim().replace(/^["“]|["”]$/g, "") ?? "";
    // Soft length cap only — do NOT split on the first "." (that would cut inside
    // decimals like "+1.5" and mangle the comment). Trim at a word boundary.
    if (text.length > 160) {
      const cut = text.slice(0, 160);
      const lastSpace = cut.lastIndexOf(" ");
      text = (lastSpace > 120 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
    }
    return text || null;
  } catch {
    return null;
  }
}

// Two-pass analysis:
//  Pass 1 — a fast shallow sweep over EVERY position to find where the errors are.
//  Pass 2 — a DEEP re-evaluation of only those few error positions (and the move
//           before), so the important moments get strong analysis without paying
//           the deep cost on all ~70 positions. Concentrates CPU where it matters.
const SHALLOW_DEPTH = 8;
const DEEP_DEPTH = 12;      // deep enough to be reliable, short enough not to freeze the free-tier CPU
const MAX_DEEP_MOVES = 6;   // cap how many error positions we deepen

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
  const buildMoves = (): Omit<Move, "id">[] =>
    history.map((move, i) => {
      const cur = whiteEval[i];
      if (cur === null) {
        return { game_id: gameId, move_number: Math.floor(i / 2) + 1, move: move.san, evaluation: null, centipawn_loss: null, classification: null };
      }
      const prev = i === 0 ? 0 : whiteEval[i - 1];
      const whiteJustMoved = i % 2 === 0;
      let centipawnLoss = 0;
      if (prev !== null) {
        const drop = whiteJustMoved ? prev - cur : cur - prev;
        centipawnLoss = Math.min(2000, Math.max(0, Math.round(drop * 100)));
      }
      return { game_id: gameId, move_number: Math.floor(i / 2) + 1, move: move.san, evaluation: cur, centipawn_loss: centipawnLoss, classification: classify(centipawnLoss) };
    });

  // ── Pass 2: deepen only the worst positions ────────────────────────────────
  const prelim = buildMoves();
  const errorIdx = prelim
    .map((m, i) => ({ i, loss: m.centipawn_loss ?? 0, cls: m.classification }))
    .filter((m) => m.cls === "blunder" || m.cls === "mistake")
    .sort((a, b) => b.loss - a.loss)
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
    // Sacrifice: a cheaper enemy piece can capture the piece we just moved,
    // yet the engine still rates this the best move → brilliant.
    let brilliant = false;
    if (movedVal >= 3 && evalBefore <= 4.5) {
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

  await supabase.from("moves").delete().eq("game_id", gameId);
  await supabase.from("moves").insert(moves.map((m) => ({ ...m })));

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

  // ── Pass 3: AI coach comments for the moves that matter ────────────────────
  // Runs inside the pre-view analysis window. Best-move (engine) + a short,
  // grounded LLM sentence, persisted to moves.explanation. Degrades gracefully
  // if the column is absent or GROQ is unset.
  if (!groq) return;

  const notable = moves
    .map((m, i) => ({ i, cls: m.classification, loss: m.centipawn_loss ?? 0 }))
    .filter((m) => m.cls && EXPLAIN_CLASSES.has(m.cls));
  const weight: Record<string, number> = { blunder: 5, mistake: 4, brilliant: 4, great: 3, inaccuracy: 1 };
  const chosen = notable
    .sort((a, b) => (weight[b.cls!] - weight[a.cls!]) || (b.loss - a.loss))
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
    const good = moves[i].classification === "brilliant" || moves[i].classification === "great";

    // Engine best move (SAN) to ground the comment — only needed for errors.
    let bestSan: string | null = null;
    if (!good) {
      try {
        const bm = await getBestMove(fenBefore, DEEP_DEPTH);
        if (bm) {
          const c = new Chess(fenBefore);
          const mv = c.move({ from: bm.from, to: bm.to, promotion: "q" });
          if (mv) bestSan = mv.san;
        }
      } catch { /* ignore */ }
    }

    // Concrete facts to ground the comment (real value, not generic praise).
    const h = history[i];
    const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    const movedVal = VAL[h.piece] ?? 0;
    const capturedVal = h.captured ? (VAL[h.captured] ?? 0) : 0;
    const movedName = PIECE_ES[h.piece] ?? "pieza";
    const capturedName = h.captured ? (PIECE_ES[h.captured] ?? "pieza") : null;

    // Can the OPPONENT recapture the piece we just moved? Check on the position
    // AFTER the move (fens[i]) — the previous code checked our own moves BEFORE
    // moving, so it never detected real sacrifices (e.g. RxB exchange sacs).
    let cheapestRecapture: number | null = null;
    try {
      const after = new Chess(fens[i]);
      const recaps = after.moves({ verbose: true }).filter((x) => x.to === h.to && x.captured);
      if (recaps.length) cheapestRecapture = Math.min(...recaps.map((x) => VAL[x.piece] ?? 99));
    } catch { /* ignore */ }
    // Net material you end up with if the opponent recaptures the moved piece.
    const netIfRecaptured = capturedVal - movedVal;
    const isSacrifice = cheapestRecapture != null && netIfRecaptured < 0;

    // Engine's real continuation after this move (as SAN) — lets the comment be
    // concrete and grounded instead of vague. Only for the good moves we praise.
    let lineSan = "";
    if (good) {
      try {
        const pv = await getPrincipalVariation(fens[i], DEEP_DEPTH, 6);
        const c = new Chess(fens[i]);
        const sans: string[] = [];
        for (const uci of pv) {
          const mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || "q" });
          if (!mv) break;
          sans.push(mv.san);
        }
        if (sans.length) lineSan = sans.join(" ");
      } catch { /* ignore */ }
    }

    let facts = "";
    if (good) {
      const line = lineSan ? ` Continuación del motor tras la jugada: ${lineSan}.` : "";
      if (isSacrifice && capturedName) {
        facts = `Sacrificio de calidad: entregas tu ${movedName} por un ${capturedName} (menos material nominal), pero el motor lo confirma como la MEJOR jugada: hay compensación.${line}`;
      } else if (isSacrifice) {
        facts = `Sacrificio: entregas tu ${movedName} sin recuperar material equivalente, y el motor lo confirma como la MEJOR jugada.${line}`;
      } else if (capturedName && capturedVal >= movedVal) {
        facts = `Ganas material: capturas un ${capturedName} con tu ${movedName}; el motor lo confirma como la mejor.${line}`;
      } else if (capturedName) {
        facts = `Capturas un ${capturedName}; el motor confirma que es la mejor jugada.${line}`;
      } else {
        facts = `El motor confirma que es la mejor jugada (no es captura).${line}`;
      }
    } else {
      facts = capturedName ? `Con esta jugada capturaste un ${capturedName}.` : `Jugada tranquila (sin captura).`;
    }

    const text = await coachComment({
      fenBefore, san: moves[i].move, bestMove: bestSan,
      moveNumber: moves[i].move_number, evalBefore, evalAfter, good, facts,
    });

    if (text) {
      try {
        await supabase.from("moves").update({ explanation: text })
          .eq("game_id", gameId).eq("move_number", moves[i].move_number).eq("move", moves[i].move);
      } catch { /* column may not exist yet */ }
    }
    // Keep the event loop responsive between heavy calls on the free tier.
    await new Promise((r) => setTimeout(r, 20));
  }
  onProgress?.(chosen.length, chosen.length, "Análisis completado");
}
