import { Chess } from "chess.js";
import { analyzeAllFens, evaluatePosition, getTopLines } from "./stockfish";
import { supabase } from "@/lib/supabase";
import { detectMotifs } from "@/lib/tacticalMotifs";
import { coachChat, coachAvailable } from "@/lib/groqCoach";
import type { Move } from "@/types";

export type MoveClassification = Move["classification"];

// How many moves get an AI coach comment. Only the moves that matter (errors +
// brilliant/great) — the ones an expert actually reads. Bounded to keep the
// pre-view analysis window reasonable.
// Raised from 16: the player reviews ~10 games/day and asked for more of the
// AI's output, and the real bottleneck is the ENGINE (two deep searches per
// commented move), not Groq — so this is a deliberate, bounded step up rather
// than an open-ended one.
const MAX_EXPLAIN = 20;
// Depth for the coach lines. Tuned to what the free-tier CPU can actually FINISH
// within the engine timeout — too deep and it times out with EMPTY lines, which
// strips the comment of its grounding and makes it worse, not better.
const EXPLAIN_DEPTH = 14;
const EXPLAIN_CLASSES = new Set(["blunder", "mistake", "inaccuracy", "brilliant", "great"]);

const fmtP = (e: number) => (Math.abs(e) >= 90 ? (e > 0 ? "mate a favor" : "mate en contra") : `${e > 0 ? "+" : ""}${e.toFixed(1)}`);

const PIECE_ES: Record<string, string> = { p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey" };
const ART_ES: Record<string, string> = { p: "el peón", n: "el caballo", b: "el alfil", r: "la torre", q: "la dama", k: "el rey" };
const PIECE_VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
// "caballo" → "el caballo". detectMotifs hands back Spanish piece NAMES, so
// this saves reverse-mapping through PIECE_ES at each use site.
const ART_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(PIECE_ES).map(([k, name]) => [name, ART_ES[k]]),
);
const artFor = (pieceName: string | undefined) =>
  (pieceName ? ART_BY_NAME[pieceName] : null) ?? `el ${pieceName ?? "pieza"}`;

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

// Evaluation bands from the PLAYER's perspective (pawns) — the vocabulary
// chess.com uses to frame how the game's state changed, rather than raw numbers.
type EvalBand = "perdida" | "peor" | "igualada" | "mejor" | "ganando";
function evalBand(e: number): EvalBand {
  if (e <= -3) return "perdida";
  if (e <= -1) return "peor";
  if (e < 1) return "igualada";
  if (e < 3) return "mejor";
  return "ganando";
}

// The narrative sentence for how the position CHANGED — chess.com's
// "La partida estaba bastante igualada, pero ahora tu oponente tiene ventaja"
// and "Estabas en una posición difícil, pero esa jugada no ha sido nada buena".
function bandNarrative(before: number, after: number): string | null {
  const b = evalBand(before), a = evalBand(after);
  const wasGood = b === "mejor" || b === "ganando";
  const nowBad = a === "peor" || a === "perdida";
  if (b === "igualada" && nowBad) return "la partida estaba igualada y ahora el rival toma la ventaja";
  if (wasGood && a === "igualada") return "tenía ventaja y la dejó escapar: ahora está igualada";
  if (wasGood && nowBad) return "iba con ventaja y ahora está peor";
  if (b === "perdida" && a === "perdida") return "ya venía de una posición difícil, así que esto no la decidió, pero tampoco ayudó";
  if (b === "ganando" && a === "ganando") return "sigue ganando, pero desperdició parte de la ventaja";
  return null;
}

// Turn a SAN move into plain Spanish ("la torre a b8", "el alfil captura el
// caballo en e5") so comments never speak in codes like "Rb8"/"Bxd5".
function describeMove(fen: string, san: string): string {
  try {
    const c = new Chess(fen);
    const m = c.move(san);
    if (!m) return san;
    if (m.san.startsWith("O-O-O")) return "enroque largo";
    if (m.san.startsWith("O-O")) return "enroque corto";
    let s = m.captured ? `${ART_ES[m.piece]} captura ${ART_ES[m.captured]} en ${m.to}` : `${ART_ES[m.piece]} a ${m.to}`;
    if (m.promotion) s += ` y corona ${PIECE_ES[m.promotion]}`;
    if (m.san.includes("#")) s += " (jaque mate)";
    else if (m.san.includes("+")) s += " (jaque)";
    return s;
  } catch { return san; }
}

// A short coach explanation, grounded in concrete facts (best move,
// sacrifice / captured material, eval swing, tactical motifs, the
// continuation line) so it explains the IDEA/plan, not just the punctual
// fact — 2-3 sentences instead of one, since a single 20-word sentence
// can't carry both "what happened" and "why it matters".
async function coachComment(args: {
  playedDesc: string; bestDesc: string | null;
  evalBefore: number; evalAfter: number;
  classification: string | null; good: boolean; facts: string;
  onlyGoodMove: boolean; materialLine: string | null; narrative: string | null;
}): Promise<string | null> {
  if (!coachAvailable) return null;
  const {
    playedDesc, bestDesc, evalBefore, evalAfter,
    classification, good, facts, onlyGoodMove, materialLine, narrative,
  } = args;
  // Mate is encoded as a huge magnitude (|score| ~10000), so a plain
  // difference produced absurd output like "te cuesta unos 9987.4 peones".
  // Mate transitions get an explicit sentence instead of a pawn count.
  const mateBefore = Math.abs(evalBefore) >= 90;
  const mateAfter = Math.abs(evalAfter) >= 90;
  const swing = mateBefore || mateAfter
    ? null
    : Math.abs(Math.round((evalAfter - evalBefore) * 10) / 10);
  const mateNote =
    mateAfter && evalAfter > 0 ? "Esta jugada DA JAQUE MATE: el alumno GANA la partida aquí mismo."
    : mateAfter && evalAfter < 0 ? "Tras esta jugada el alumno queda con mate forzado EN CONTRA: pierde."
    : mateBefore && evalBefore > 0 ? "El alumno TENÍA un jaque mate forzado a su favor y lo dejó escapar con esta jugada."
    : mateBefore && evalBefore < 0 ? "El alumno ya venía con mate forzado en contra antes de esta jugada."
    : null;

  // Shared voice. Modeled on chess.com's Game Review coach: SHORT, concrete,
  // and consequence-first. Its depth comes from naming the exact thing that
  // happens ("se pierde un alfil"), not from more words — so the limit stays
  // tight while the CONTENT gets much richer than before.
  const STYLE = `CÓMO ESCRIBIR (imita al coach de la revisión de partidas de Chess.com):
- Español, 2 frases completas y naturales. Entre 25 y 45 palabras en TOTAL: ni telegráfico ni un párrafo. Segunda persona ("dejas", "pierdes", "encontraste").
- NO enumeres la línea de jugadas que viene después ("luego el alfil a e4, la dama a c8 y la torre a d1"): eso suena a listado de motor, no a entrenador. Di la IDEA, no la secuencia.
- VARÍA el arranque. NO empieces siempre igual: evita abrir todos los comentarios con "Pierdes…". Alterna entre nombrar la pieza y la casilla, lo que el rival consigue, la idea que dejaste pasar, o cómo cambió la partida.
- PROHIBIDO escribir notación algebraica (nada de "Bxh3", "exd5", "Rf4", "O-O"). Habla siempre en palabras: "el alfil captura en h3", "el enroque corto".
- Frase 1 = LA CONSECUENCIA CONCRETA: qué se pierde o qué se gana. Si en los datos hay una consecuencia material, dila con esa pieza exacta ("con esta jugada se pierde un alfil", "permites que capturen la torre y ganen material tras los cambios").
- Frase 2 = el POR QUÉ / la alternativa: qué lograba la jugada correcta, o qué idea deja pasar. Usa la descripción de la jugada correcta tal como viene en los datos.
- USA el vocabulario ajedrecístico exacto cuando esté verificado en los datos: horquilla, clavada, pincho, ataque a la descubierta, pieza colgada, doble ataque, jaque mate forzado. Tejido natural en la frase ("...con una horquilla sobre la dama y la torre"), nunca como etiqueta ("el patrón verificado es...").
- Puedes mencionar la ventaja en peones si aporta (ej. "casi 4 peones de ventaja"). Nada de la palabra "evaluación".
- Nombra piezas y casillas ("el alfil de c4"), NUNCA notación suelta tipo "Bxd5" o "Rb8".
- PROHIBIDO: inventar variantes, piezas, patrones o causas que no estén en los datos. PROHIBIDO el relleno: "mejorar la posición", "obtener ventaja", "controlar el centro" (salvo que sea literalmente el punto).
- PROHIBIDA la muletilla "dejaste pasar la oportunidad de…". Di directamente qué había: "el alfil de f5 clavaba la dama", "tenías una horquilla con el caballo", "la torre de b8 ganaba el alfil de b2".
- Si el dato de ventaja perdida trae un número, escríbelo completo ("unos 1.1 peones"); nunca "unos peones" a secas.
- CUIDADO CON QUIÉN HACE QUÉ. "Jugada del alumno" la hizo el ALUMNO (tú, el lector). Si el alumno captura algo, es él quien captura: escribe "capturas el peón", nunca "dejas que el rival capture". Si el rival captura algo del alumno, escribe "el rival te captura…". Nunca inviertas los papeles.
- No transformes piezas: una pieza no "se convierte" en otra ni cambia de tipo. Solo se mueve, captura, o es capturada.
- Devuelve SOLO el texto del comentario, sin comillas ni encabezados.`;

  // Verified context block — everything here was computed from the real board
  // or the engine, so the model can narrate it freely without hallucinating.
  // A checkmate needs no LLM: the content is fully determined by the move, and
  // every model pass added a hallucinated contradiction ("ganas con jaque mate.
  // Dejaste pasar la oportunidad de evitar el jaque mate") no matter how
  // explicitly the prompt forbade it. Deterministic text = always correct, and
  // it saves a Groq call on the most common decisive moment.
  if (mateAfter && evalAfter > 0) {
    const desc = playedDesc.replace(/\s*\((?:jaque mate|jaque)\)\s*$/i, "").trim();
    return `¡Jaque mate! ${desc.charAt(0).toUpperCase()}${desc.slice(1)} remata la partida.`;
  }

  const ctx = [
    // Deliberately NO algebraic notation here. Handing the model the SAN made
    // it echo raw notation ("Bxh3", "exd5") straight into the comment, which
    // reads like an engine dump — and the UI already shows the SAN in the
    // header right above this text, so repeating it adds nothing.
    `Jugada del alumno: ${playedDesc}`,
    // The real evaluation, restored: chess.com shows this number right next to
    // the comment, and hiding it from the model was part of why comments felt
    // weightless. Player's perspective, so + always means "good for you".
    `Evaluación antes → después (perspectiva del alumno): ${fmtP(evalBefore)} → ${fmtP(evalAfter)}`,
    // A move that already delivers mate has no "better alternative" worth
    // naming — offering one produced the absurd "you missed a fork" on a
    // checkmating move.
    // No "the correct move was X" on a move that was itself strong: the
    // classification comes from the shallow sweep while bestDesc comes from a
    // deeper search, so they can disagree — and telling the player their
    // brilliancy was wrong is both confusing and demoralizing. Also suppressed
    // once the played move already mates.
    bestDesc && !good ? `Jugada correcta según el motor: ${bestDesc}` : null,
    mateNote ? `DATO DECISIVO (menciónalo, manda sobre todo lo demás): ${mateNote}` : null,
    materialLine ? `Consecuencia material verificada: ${materialLine}` : null,
    narrative ? `Cómo cambió la partida: ${narrative}` : null,
    swing != null && swing >= 0.5 && !good ? `Ventaja perdida: unos ${swing.toFixed(1)} peones` : null,
    onlyGoodMove && good ? `Dato: era la ÚNICA jugada buena de la posición (las demás empeoraban bastante)` : null,
    // On a mating move every other fact (forks, material counts, "the best
    // move was…") is noise the model turns into self-contradictions — it wrote
    // "you mated" and "the correct move was a fork" in the same comment. When
    // the move ends the game, that IS the whole story.
    mateAfter && evalAfter > 0 ? null : facts,
  ].filter(Boolean).join("\n");

  // Per-classification framing — chess.com doesn't use one voice for
  // everything: a blunder, a slight inaccuracy and a brilliancy each get a
  // different opening beat. One shared prompt was a big part of why every
  // comment here sounded the same.
  // Note: the mate-delivered case returned deterministically above, so it
  // needs no role here.
  let role: string;
  if (good && onlyGoodMove) {
    role = `Eres el coach de una revisión de partida. El alumno encontró la ÚNICA jugada buena. Empieza reconociéndolo con energía (estilo "¡Solo había una jugada buena y la encontraste!") y di en concreto qué logra: qué amenaza para, qué material gana o qué mate fuerza.
IMPORTANTE: es una jugada BUENA. Nunca la presentes como pérdida ni como error. Si entrega material, es un SACRIFICIO con compensación: dilo así ("entregas el alfil a cambio de…"), nunca "pierdes el alfil".`;
  } else if (good) {
    role = `Eres el coach de una revisión de partida. El alumno acaba de hacer una jugada muy fuerte. Di en concreto qué consigue (material, mate forzado, una táctica nombrada) y qué le hace eso a la posición.
IMPORTANTE: es una jugada BUENA. Nunca la presentes como pérdida ni como error. Si entrega material, es un SACRIFICIO con compensación: dilo así ("entregas el alfil a cambio de…"), nunca "pierdes el alfil".`;
  } else if (classification === "inaccuracy") {
    role = `Eres el coach de una revisión de partida. El alumno jugó una imprecisión: no es grave, así que NO dramatices. Di qué pequeña ventaja o idea deja escapar y qué era mejor.`;
  } else if (classification === "blunder") {
    role = `Eres el coach de una revisión de partida. El alumno cometió un error GRAVE. Empieza por la consecuencia material o táctica concreta (qué pierde exactamente) y luego qué debía jugar.`;
  } else {
    role = `Eres el coach de una revisión de partida. El alumno cometió un error. Di la consecuencia concreta y qué era mejor.`;
  }

  const raw = await coachChat(`${role}\n\nDATOS VERIFICADOS DE ESTA JUGADA (no inventes nada fuera de aquí):\n${ctx}\n\n${STYLE}`,
    // Tokens deliberately tight: with a bigger budget the model padded the
    // comment out with the engine's move list until it hit the character cap
    // and got cut mid-sentence. Short prompt + short budget = chess.com's
    // punchy register.
    // Low temperature + a hard token ceiling: at 0.5/150 the model invented
    // (a bishop "turning into a pawn"), inverted who captured whom, and padded
    // to the character cap until it got cut mid-sentence. ~100 tokens is about
    // 45 Spanish words — the chess.com register — and it can't ramble past it.
    { temperature: 0.3, maxTokens: 100 });
  if (!raw) return null;
  let text = raw.replace(/^["“]|["”]$/g, "");
  // Soft length cap at a word boundary — do NOT split on the first "." (that
  // would cut inside decimals like "+1.5"). Raised from 200 to fit a real
  // consequence + alternative; the coach card clamps to 5 lines and expands
  // on tap, so a slightly longer comment is readable rather than truncated.
  if (text.length > 300) {
    const cut = text.slice(0, 300);
    const lastSpace = cut.lastIndexOf(" ");
    text = (lastSpace > 220 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
  }
  return text || null;
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

  // ── Pass 3: AI coach comments for the moves that matter ────────────────────
  // Runs inside the pre-view analysis window. Best-move (engine) + a short,
  // grounded LLM sentence, persisted to moves.explanation. Degrades gracefully
  // if the column is absent or GROQ is unset.
  if (!coachAvailable) return;

  // Only comment the TRACKED PLAYER's own moves. Every comment is written in
  // "you played this" framing, and GameViewer deliberately shows it only for
  // the player's own plies (an opponent move can't be "your" mistake) — so
  // commenting both colors silently threw away half the budget: half the Groq
  // calls AND half the deep engine searches produced text nothing ever renders.
  // Filtering here doubles the comments the player actually sees at no extra
  // cost. Falls back to commenting everything if played_as is unavailable, so
  // an older/incomplete row degrades instead of losing all commentary.
  let playerIsWhite: boolean | null = null;
  try {
    const { data: g } = await supabase.from("games").select("played_as").eq("id", gameId).single();
    if (g?.played_as === "white") playerIsWhite = true;
    else if (g?.played_as === "black") playerIsWhite = false;
  } catch { /* keep null → comment both colors */ }
  const isPlayerPly = (i: number) => playerIsWhite === null || (i % 2 === 0) === playerIsWhite;

  const notable = moves
    .map((m, i) => ({ i, cls: m.classification, loss: m.centipawn_loss ?? 0 }))
    .filter((m) => isPlayerPly(m.i))
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
    const mainLineSan = mainSans.join(" ");
    const forcedMate = lines[0]?.mate != null;

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

    // Verifiable tactical phrase (never invented).
    let facts = "";
    let materialLine: string | null = null;
    if (good) {
      let tactic: string | null = null;
      if (forcedMate || /#/.test(mainLineSan)) tactic = "conduce a un jaque mate forzado a favor del alumno";
      else if (gaveCheck && doubleAttack >= 1) tactic = "da jaque y a la vez ataca otra pieza (doble ataque)";
      else if (doubleAttack >= 2) tactic = "crea un doble ataque sobre dos piezas";
      else if (gaveCheck) tactic = "la jugada da jaque";

      let material: string | null = null;
      if (isSacrifice && capturedName) material = `es un sacrificio de calidad: entrega ${movedName} por ${capturedName}, pero el motor la confirma como la mejor jugada (hay compensación)`;
      else if (isSacrifice) material = `es un sacrificio: entrega ${movedName} sin recuperar material equivalente, y el motor la confirma como la mejor`;
      else if (capturedName && capturedVal >= movedVal) material = `gana material: captura ${capturedName} con ${movedName}`;
      else if (capturedName) material = `captura ${capturedName}`;

      // Net material across the engine's whole line — catches "wins a piece
      // after the exchanges", which the single-capture check above can't see.
      if (mainSans.length > 1) {
        const { net } = materialOverLine(fenBefore, mainSans, playerColor);
        if (net <= -2) materialLine = `en el balance de la línea el alumno gana unos ${-net} peones de material`;
      }

      // Rule-based tactical-pattern detection (real board geometry) — names
      // the exact pattern (horquilla/clavada/pincho) when there genuinely is
      // one, instead of the model vaguely describing "a good tactic".
      const playedMotifs = detectMotifs(fenBefore, moves[i].move).filter((m) => m.key !== "hangs_own");
      const motifLine = playedMotifs.length
        ? `Patrón verificado: ${playedMotifs.map((m) => m.key === "hanging" && m.pieceName && m.square
            ? `deja ${artFor(m.pieceName)} de ${m.square} sin defensa`
            : `${m.label}${m.square && m.pieceName ? ` sobre ${artFor(m.pieceName)} de ${m.square}` : ""}`).join(", ")}.`
        : null;

      const fieldLines: string[] = [`El motor confirma que es la mejor jugada de la posición.`];
      if (material) fieldLines.push(`Detalle de material: ${material}`);
      if (tactic) fieldLines.push(`Táctica: ${tactic}`);
      if (motifLine) fieldLines.push(motifLine);
      facts = fieldLines.join("\n");
    } else {
      // What does the move ALLOW? The opponent's best reply from the after-position
      // — grounds "what went wrong" instead of only "you should've played X".
      let concede: string | null = null;
      let oppSans: string[] = [];
      try {
        const opp = await getTopLines(fens[i], DEEP_DEPTH, 1);
        oppSans = opp[0] ? pvToSan(fens[i], opp[0].pv) : [];
        const oppSan = oppSans[0] ?? null;
        if (oppSan) {
          const cc = new Chess(fens[i]);
          const mv = cc.moves({ verbose: true }).find((x) => x.san === oppSan);
          concede = mv && mv.captured && (VAL[mv.captured] ?? 0) >= 3
            ? `el rival puede jugar ${describeMove(fens[i], oppSan)}, ganando ${ART_ES[mv.captured]}`
            : `el rival responde con ${describeMove(fens[i], oppSan)}`;
        }
      } catch { /* ignore */ }

      // The concrete material consequence over the opponent's whole punishment
      // line — this is what lets the comment say "se pierde un alfil" or
      // "gana una torre tras los cambios" the way chess.com does, instead of
      // only naming the opponent's first reply.
      if (oppSans.length) {
        const { net, biggestLostType, trades, settled } = materialOverLine(fens[i], oppSans, playerColor);
        if (net >= 2 && biggestLostType && settled) {
          const lost = ART_ES[biggestLostType] ?? "la pieza";
          materialLine = trades
            ? `tras los intercambios el rival gana material: se pierde ${lost} (unos ${net} peones netos)`
            : `con esta jugada se pierde ${lost} sin compensación`;
        }
      }

      // Rule-based tactical-pattern detection (real board geometry, not the
      // model guessing) — same detector used in the Story Mode coach, now
      // grounding the batch analysis too. fork/pin/skewer/discovered/hanging
      // describe a threat the MOVER creates against the OPPONENT (never a
      // self-inflicted problem); hangs_own is the mirror case (the mover's
      // own piece left undefended) and IS a genuine self-caused issue.
      const playedMotifs = detectMotifs(fenBefore, moves[i].move);
      const bestMotifs = bestSan ? detectMotifs(fenBefore, bestSan) : [];
      const playedSelfHang = playedMotifs.find((m) => m.key === "hangs_own");
      const bestThreats = bestMotifs.filter((m) => m.key !== "hangs_own");
      // Phrase each motif the way a human says it. "pieza colgada sobre el
      // alfil en b2" (the old generic template) is confusing word order — a
      // hanging piece IS the piece, it isn't "on" it.
      const motifPhrase = (m: { key: string; label: string; square?: string; pieceName?: string }) =>
        (m.key === "hanging" || m.key === "hangs_own") && m.pieceName && m.square
          ? `${artFor(m.pieceName)} de ${m.square} queda sin defensa`
          : `${m.label}${m.square && m.pieceName ? ` sobre ${artFor(m.pieceName)} de ${m.square}` : ""}`;
      const motifLine = playedSelfHang
        ? `Patrón verificado: tras esta jugada ${artFor(playedSelfHang.pieceName)} de ${playedSelfHang.square} se queda sin ningún defensor — esta es la causa real del error.`
        : bestThreats.length
          ? `Patrón verificado que el alumno dejó pasar (lo lograba la jugada correcta): ${bestThreats.map(motifPhrase).join(", ")}.`
          : null;

      // Labeled fields (not a run-on paragraph) — the LLM composes a cleaner,
      // less ambiguous sentence from clearly separated facts than from prose.
      const fieldLines: string[] = [];
      fieldLines.push(`Pieza que movió el alumno: ${ART_ES[h.piece] ?? movedName}${capturedName ? ` (capturó ${capturedName})` : ""}`);
      if (concede) fieldLines.push(`Lo que esto permite al rival: ${concede}`);
      if (motifLine) fieldLines.push(motifLine);
      if (forcedMate) fieldLines.push(`Dato importante: el alumno tenía un jaque mate forzado a su favor y lo dejó pasar`);
      facts = fieldLines.join("\n");
    }

    const text = await coachComment({
      playedDesc: describeMove(fenBefore, moves[i].move),
      // Never hand back the played move AS the correction — on a good move the
      // engine's best IS what was played, and the model then wrote the absurd
      // "la jugada correcta era la misma que jugaste".
      bestDesc: bestSan && bestSan !== moves[i].move ? describeMove(fenBefore, bestSan) : null,
      evalBefore, evalAfter,
      classification: moves[i].classification,
      good, facts, onlyGoodMove, materialLine,
      // Only for errors: the band narrative describes advantage being LOST, so
      // it would read backwards on a brilliancy.
      narrative: good ? null : bandNarrative(evalBefore, evalAfter),
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
  onProgress?.(chosen.length, chosen.length, "Análisis completado");
}
