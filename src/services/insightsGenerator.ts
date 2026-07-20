import { Chess } from "chess.js";
import { supabase } from "@/lib/supabase";
import { translateOpening } from "@/lib/translateOpening";
import { detectMotifs } from "@/lib/tacticalMotifs";
import { hasModernSchema } from "./dashboardData";
import { coachChat, coachAvailable } from "@/lib/groqCoach";
import type { Insight } from "@/types";

// ─── Clock parsing ────────────────────────────────────────────────────────────

// Returns remaining seconds for each half-move (ply) in the order they appear in PGN.
// Chess.com encodes: 1. e4 { [%clk 0:10:00] } 1... e5 { [%clk 0:09:58] }
function parsePgnClocks(pgn: string): number[] {
  const times: number[] = [];
  const re = /\[%clk\s+(\d+):(\d+):(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pgn)) !== null) {
    times.push(parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]));
  }
  return times;
}

// Detects a "time collapse": clock was fine (>60s) then fell below 30s, meaning
// the player was in a scramble during those plies.
function timePressurePlies(clocks: number[]): Set<number> {
  const pressurePlies = new Set<number>();
  for (let i = 0; i < clocks.length; i++) {
    if (clocks[i] < 30) pressurePlies.add(i);
  }
  return pressurePlies;
}

// ─── Move pattern detection ───────────────────────────────────────────────────

// Returns true if SAN move is a queen move (starts with Q, not Qx? capture notation edge case).
const isQueenMove = (san: string) => san.startsWith("Q");

// Returns true if SAN move is a piece development move (knight or bishop).
const isDevelopmentMove = (san: string) =>
  san.startsWith("N") || san.startsWith("B");

// ─── Snapshot ─────────────────────────────────────────────────────────────────

interface BlunderPhases {
  opening: number;    // moves 1–10
  middlegame: number; // moves 11–25
  endgame: number;    // moves 26+
}

interface PlayerSnapshot {
  totalGames: number;
  winrate: number;
  avgAccuracy: number | null;

  // Opening habits
  topOpenings: { name: string; games: number; winrate: number }[];
  worstOpenings: { name: string; games: number; winrate: number }[];
  earlyQueenGames: number;        // games with a queen move before move 6
  lowDevelopmentGames: number;    // games with <3 N/B moves in first 10 plies

  // Time pressure
  hasClockData: boolean;
  timePressureGames: number;      // games where clock fell below 30s
  timePressureBlunders: number;   // blunders that occurred during time pressure
  totalBlundersInTimeGames: number;

  // Tactical weaknesses
  blundersByPhase: BlunderPhases;
  severeBlunders: number;         // centipawn_loss > 300
  totalBlunders: number;
  totalMistakes: number;
  peakBlunderMoveRange: string | null; // e.g. "moves 12–18"

  // Concrete error positions — the actual moves where the player hung a piece
  // (their own piece left undefended), reconstructed from the game PGN and
  // verified by board geometry (detectMotifs), NOT an aggregate stat. This is
  // what turns "revisa tus errores" into "colgaste el caballo en f5, el alfil
  // en c4…" — a real, specific, non-generic diagnosis.
  hungPieces: { piece: string; square: string; opening: string | null; phase: keyof BlunderPhases }[];
}

async function buildSnapshot(userId: string): Promise<PlayerSnapshot | null> {
  // Fetch game IDs first so we can join cleanly.
  // Order by real play date (played_at) when the column exists; else by import
  // time. created_at is identical across a full-history batch, so played_at is
  // preferred, but the query must not fail if the migration hasn't run.
  // Reuses dashboardData's cache()-memoized probe instead of re-querying —
  // a dashboard load calls both this and getDashboardStats in the same request.
  const orderCol = (await hasModernSchema()) ? "played_at" : "created_at";
  const { data: gameRows } = await supabase
    .from("games")
    .select("id, result, accuracy, pgn, played_as, opening")
    .eq("user_id", userId)
    .order(orderCol, { ascending: false, nullsFirst: true }) // matches games_user_played_at_idx (faster)
    .limit(50);

  if (!gameRows || gameRows.length === 0) return null;

  const gameIds = gameRows.map((g) => g.id);

  const [movesRes, openingsRes] = await Promise.all([
    supabase
      .from("moves")
      .select("game_id, move_number, move, centipawn_loss, classification")
      .in("game_id", gameIds),
    supabase
      .from("opening_stats")
      .select("opening_name, games_played, wins, losses, draws, winrate")
      .eq("user_id", userId)
      .gte("games_played", 2)
      .order("games_played", { ascending: false })
      .limit(12),
  ]);

  const moves = movesRes.data ?? [];
  const openings = openingsRes.data ?? [];

  // ── General stats ──────────────────────────────────────────────────────────
  const wins = gameRows.filter((g) => g.result === "win").length;
  const accuracies = gameRows
    .map((g) => g.accuracy)
    .filter((a): a is number => a !== null);
  const avgAccuracy =
    accuracies.length > 0
      ? Math.round((accuracies.reduce((s, a) => s + a, 0) / accuracies.length) * 10) / 10
      : null;

  // ── Opening patterns (from moves table) ───────────────────────────────────
  // Group moves by game_id for per-game analysis.
  const movesByGame = new Map<string, typeof moves>();
  for (const m of moves) {
    if (!movesByGame.has(m.game_id)) movesByGame.set(m.game_id, []);
    movesByGame.get(m.game_id)!.push(m);
  }

  let earlyQueenGames = 0;
  let lowDevelopmentGames = 0;

  for (const [, gameMoves] of movesByGame) {
    const early = gameMoves.filter((m) => m.move_number <= 5);
    if (early.some((m) => m.move !== null && isQueenMove(m.move))) {
      earlyQueenGames++;
    }

    const first10 = gameMoves.filter((m) => m.move_number <= 10);
    const devCount = first10.filter((m) => m.move !== null && isDevelopmentMove(m.move)).length;
    if (devCount < 3) lowDevelopmentGames++;
  }

  // ── Tactical weaknesses ───────────────────────────────────────────────────
  const analyzed = moves.filter((m) => m.classification !== null);
  const blunders = analyzed.filter((m) => m.classification === "blunder");
  const mistakes = analyzed.filter((m) => m.classification === "mistake");

  const blundersByPhase: BlunderPhases = {
    opening:    blunders.filter((m) => m.move_number <= 10).length,
    middlegame: blunders.filter((m) => m.move_number > 10 && m.move_number <= 25).length,
    endgame:    blunders.filter((m) => m.move_number > 25).length,
  };

  const severeBlunders = analyzed.filter(
    (m) => m.centipawn_loss !== null && m.centipawn_loss > 300
  ).length;

  // Find the 8-move window with the most blunders+mistakes.
  const errors = [...blunders, ...mistakes];
  let peakBlunderMoveRange: string | null = null;
  if (errors.length >= 3) {
    let bestStart = 1;
    let bestCount = 0;
    for (let start = 1; start <= 30; start++) {
      const count = errors.filter(
        (e) => e.move_number >= start && e.move_number < start + 8
      ).length;
      if (count > bestCount) {
        bestCount = count;
        bestStart = start;
      }
    }
    if (bestCount >= 2) {
      peakBlunderMoveRange = `moves ${bestStart}–${bestStart + 7}`;
    }
  }

  // ── Concrete hung-piece positions (reconstructed from PGN) ────────────────
  // Replay each game, find the player's OWN blunder/mistake plies, and check
  // (via board geometry) which of them left one of the player's pieces
  // undefended — the single most common club-level error. Each hit carries the
  // real piece + square + opening + phase, so the coach note can name exactly
  // what happened instead of a generic "revisa tus errores".
  const phaseOf = (moveNumber: number): keyof BlunderPhases =>
    moveNumber <= 10 ? "opening" : moveNumber <= 25 ? "middlegame" : "endgame";
  const hungPieces: PlayerSnapshot["hungPieces"] = [];
  for (const game of gameRows) {
    if (hungPieces.length >= 8) break;
    if (!game.pgn) continue;
    const playerColor = game.played_as === "white" ? "w" : "b";
    // Only this game's OWN blunder/mistake moves, keyed by (move_number, SAN).
    const errs = new Set(
      (movesByGame.get(game.id) ?? [])
        .filter((m) => (m.classification === "blunder" || m.classification === "mistake") && m.move)
        .map((m) => `${m.move_number}:${m.move}`),
    );
    if (errs.size === 0) continue;
    const chess = new Chess();
    try { chess.loadPgn(game.pgn); } catch { continue; }
    const hist = chess.history({ verbose: true });
    for (let ply = 0; ply < hist.length; ply++) {
      const h = hist[ply];
      if (h.color !== playerColor) continue;
      const moveNumber = Math.floor(ply / 2) + 1;
      if (!errs.has(`${moveNumber}:${h.san}`)) continue;
      const selfHang = detectMotifs(h.before, h.san).find((mo) => mo.key === "hangs_own");
      if (selfHang?.pieceName && selfHang.square) {
        hungPieces.push({
          piece: selfHang.pieceName,
          square: selfHang.square,
          opening: game.opening ? translateOpening(game.opening) : null,
          phase: phaseOf(moveNumber),
        });
        if (hungPieces.length >= 8) break;
      }
    }
  }

  // ── Time pressure (from PGN clock annotations) ────────────────────────────
  let timePressureGames = 0;
  let timePressureBlunders = 0;
  let totalBlundersInTimeGames = 0;
  let hasClockData = false;

  for (const game of gameRows) {
    const clocks = parsePgnClocks(game.pgn ?? "");
    if (clocks.length === 0) continue;
    hasClockData = true;

    const pressurePlies = timePressurePlies(clocks);
    const inTimePressure = pressurePlies.size > 0;

    if (!inTimePressure) continue;
    timePressureGames++;

    const gameBlunders = (movesByGame.get(game.id) ?? []).filter(
      (m) => m.classification === "blunder" || m.classification === "mistake"
    );
    totalBlundersInTimeGames += gameBlunders.length;

    // A move_number maps to ply index: white move N = ply (2N-2), black = ply (2N-1).
    // We check the ply just before the move to see if the clock was low.
    for (const m of gameBlunders) {
      const ply = game.played_as === "white"
        ? (m.move_number - 1) * 2
        : (m.move_number - 1) * 2 + 1;
      if (pressurePlies.has(ply) || pressurePlies.has(ply - 1)) {
        timePressureBlunders++;
      }
    }
  }

  // ── Openings ranking ──────────────────────────────────────────────────────
  const sorted = [...openings].sort((a, b) => b.winrate - a.winrate);

  return {
    totalGames: gameRows.length,
    winrate: Math.round((wins / gameRows.length) * 100),
    avgAccuracy,

    topOpenings: sorted.slice(0, 3).map((o) => ({
      name: translateOpening(o.opening_name),
      games: o.games_played,
      winrate: o.winrate,
    })),
    worstOpenings: sorted.slice(-3).reverse().map((o) => ({
      name: translateOpening(o.opening_name),
      games: o.games_played,
      winrate: o.winrate,
    })),
    earlyQueenGames,
    lowDevelopmentGames,

    hasClockData,
    timePressureGames,
    timePressureBlunders,
    totalBlundersInTimeGames,

    blundersByPhase,
    severeBlunders,
    totalBlunders: blunders.length,
    totalMistakes: mistakes.length,
    peakBlunderMoveRange,
    hungPieces,
  };
}

// ─── Facts (deterministic — the numbers are never left to an LLM) ───────────
//
// Every number in a message below comes straight from the player's own data,
// computed in code — never from an LLM guess. That stays true even after
// `deepenInsight` rewrites the wording: the model is handed the exact,
// already-correct fact string and told to explain/expand it, not recompute
// or invent new figures. This keeps the accuracy guarantee while fixing the
// actual complaint (the fixed templates read as generic/robotic).

interface Fact extends GeneratedInsight {
  weight: number; // higher = more prominent; used to pick and order the top few
}

function computeFacts(s: PlayerSnapshot): GeneratedInsight[] {
  const facts: Fact[] = [];
  const phaseEs = { opening: "la apertura", middlegame: "el medio juego", endgame: "el final" } as const;

  // 1. Time pressure — the clearest behavioral pattern when clock data exists.
  if (s.hasClockData && s.totalBlundersInTimeGames >= 3) {
    const share = Math.round((s.timePressureBlunders / s.totalBlundersInTimeGames) * 100);
    if (share >= 30) {
      facts.push({
        category: "time_management",
        message: `El ${share}% de tus errores (${s.timePressureBlunders} de ${s.totalBlundersInTimeGames}) llegan con menos de 30s en el reloj. Juega la apertura más rápido para guardar tiempo.`,
        severity: share >= 50 ? "high" : "medium",
        weight: 100 + share,
      });
    }
  }

  // 1b. Hung pieces — the most concrete, highest-value pattern: the actual
  // pieces the player left undefended, by real square. Verified by board
  // geometry, so the coach can name them exactly (weighted above the generic
  // aggregate facts precisely because it's specific, not templated).
  if (s.hungPieces.length >= 3) {
    const n = s.hungPieces.length;
    const phaseWord = { opening: "la apertura", middlegame: "el medio juego", endgame: "el final" } as const;
    const phaseCount = s.hungPieces.reduce<Record<string, number>>((acc, h) => {
      acc[h.phase] = (acc[h.phase] ?? 0) + 1; return acc;
    }, {});
    const domPhase = Object.entries(phaseCount).sort((a, b) => b[1] - a[1])[0];
    const phaseHint = domPhase && domPhase[1] >= Math.ceil(n * 0.6)
      ? ` Casi siempre en ${phaseWord[domPhase[0] as keyof BlunderPhases]}.`
      : "";

    // When it's always the same piece (a real, sharper pattern — "you keep
    // hanging your bishop"), say that; otherwise list the mixed examples.
    const uniquePieces = [...new Set(s.hungPieces.map((h) => h.piece))];
    const squares = [...new Set(s.hungPieces.map((h) => h.square))];
    let message: string;
    if (uniquePieces.length === 1) {
      const piece = uniquePieces[0];
      const sqList = squares.slice(0, 4).join(", ");
      message = `Colgaste tu ${piece} sin defensa en ${n} jugadas (en ${sqList}${squares.length > 4 ? ", entre otras" : ""}).${phaseHint} Antes de mover tu ${piece}, confirma que quede defendido.`;
    } else {
      // Dedupe the shown examples (the same piece+square can recur across
      // games) while keeping the real occurrence count n.
      const seen = new Set<string>();
      const uniqueExamples: string[] = [];
      for (const h of s.hungPieces) {
        const e = `el ${h.piece} en ${h.square}`;
        if (!seen.has(e)) { seen.add(e); uniqueExamples.push(e); }
      }
      const examples = uniqueExamples.slice(0, 3).join(", ");
      message = `Colgaste una pieza sin defensa en ${n} jugadas: ${examples}${uniqueExamples.length > 3 ? ", entre otras" : ""}.${phaseHint} Antes de mover, revisa si tu pieza queda defendida.`;
    }
    facts.push({ category: "recurring_blunder", message, severity: n >= 6 ? "high" : "medium", weight: 95 + n, skipDeepen: true });
  }

  // 2. Peak error window — where in the game your mistakes cluster.
  if (s.peakBlunderMoveRange) {
    const range = s.peakBlunderMoveRange.replace("moves", "las jugadas");
    facts.push({
      category: "tactical",
      message: `Tu zona de mayor error es ${range}: es donde más se te escapan las partidas. Revísalas con calma.`,
      severity: "medium",
      weight: 70,
    });
  }

  // 3. Dominant phase for blunders (skip if it duplicates the peak window idea).
  const phases = Object.entries(s.blundersByPhase) as [keyof BlunderPhases, number][];
  const topPhase = phases.sort((a, b) => b[1] - a[1])[0];
  if (topPhase && topPhase[1] >= 3 && !s.peakBlunderMoveRange) {
    facts.push({
      category: "recurring_blunder",
      message: `${topPhase[1]} de tus errores graves ocurren en ${phaseEs[topPhase[0]]}. Es tu fase más floja.`,
      severity: "medium",
      weight: 60 + topPhase[1],
    });
  }

  // 4. Weakest opening (needs a real sample).
  const worst = s.worstOpenings.find((o) => o.games >= 3 && o.winrate < 45);
  if (worst) {
    facts.push({
      category: "opening",
      message: `Con ${worst.name} solo ganas ${worst.winrate}% (${worst.games} partidas) — es tu apertura más floja. Estúdiala o cámbiala.`,
      severity: worst.winrate < 30 ? "high" : "medium",
      weight: 65 + (45 - worst.winrate),
    });
  }

  // 5. Early-queen habit.
  if (s.earlyQueenGames >= Math.max(4, s.totalGames * 0.15)) {
    facts.push({
      category: "opening",
      message: `Sacas la dama antes de la jugada 6 en ${s.earlyQueenGames} partidas: la expones a ataques que te hacen perder tiempo.`,
      severity: "low",
      weight: 40 + s.earlyQueenGames,
    });
  }

  // 6. Passive development.
  if (s.lowDevelopmentGames >= Math.max(4, s.totalGames * 0.2)) {
    facts.push({
      category: "opening",
      message: `En ${s.lowDevelopmentGames} partidas desarrollaste menos de 3 piezas en las primeras 10 jugadas. Prioriza sacar caballos y alfiles.`,
      severity: "low",
      weight: 38 + s.lowDevelopmentGames,
    });
  }

  // 7. Severe blunders fallback (if we still have few facts).
  if (s.severeBlunders >= 3) {
    facts.push({
      category: "tactical",
      message: `${s.severeBlunders} veces regalaste más de 3 puntos de ventaja en una sola jugada. Antes de mover, revisa capturas y jaques del rival.`,
      severity: s.severeBlunders >= 10 ? "high" : "medium",
      weight: 50 + s.severeBlunders,
    });
  }

  // Pick the strongest, keep category variety, cap at 4.
  facts.sort((a, b) => b.weight - a.weight);
  const chosen: Fact[] = [];
  const seenCat = new Set<string>();
  for (const f of facts) {
    if (chosen.length >= 4) break;
    if (seenCat.has(f.category) && chosen.length >= 2) continue; // allow variety first
    chosen.push(f);
    seenCat.add(f.category);
  }
  // Drop the internal `weight` field — callers only need the insight shape.
  return chosen.map((f): GeneratedInsight => ({
    category: f.category,
    message: f.message,
    severity: f.severity,
    skipDeepen: f.skipDeepen,
  }));
}

// ─── Deepen (LLM rewrite of an already-correct fact) ────────────────────────
//
// The fixed templates read as generic/robotic — same phrasing every time,
// no matter the player. This rewrites each one into a warmer, more specific
// coach note, but the model NEVER sees raw numbers to compute on its own:
// it's handed the finished, verified sentence and told to explain/expand it,
// repeating every figure verbatim. Falls back to the original template on
// any failure (missing key, timeout, empty response) — never blocks or
// blanks out an insight just because the rewrite didn't work.
const CATEGORY_LABEL_ES: Record<Insight["category"], string> = {
  opening: "aperturas",
  tactical: "táctica",
  time_management: "manejo del reloj",
  recurring_blunder: "errores recurrentes",
};

async function deepenInsight(fact: GeneratedInsight): Promise<string> {
  if (!coachAvailable) return fact.message;
  const prompt = `Eres el entrenador personal de un jugador de ajedrez de club, escribiendo una nota corta para su panel de progreso (categoría: ${CATEGORY_LABEL_ES[fact.category]}).

Hecho verificado sobre este jugador (ya calculado, con datos reales de sus partidas — NO recalcules ni inventes ningún número distinto a los que aparecen aquí):
"${fact.message}"

Reescríbelo en EXACTAMENTE 2 frases completas (nunca 3, nunca fragmentos), cada una de 12 a 20 palabras:
- Frase 1: repite el hecho con sus datos EXACTOS — números, y también piezas, casillas, fase o apertura si aparecen (ni los redondees ni inventes otros). Apóyate en esos detalles concretos que YA están escritos arriba para explicar el patrón; están verificados, úsalos. Lo único prohibido es inventar piezas, casillas, jugadas, aperturas o causas que NO estén en el texto de arriba.
- Frase 2: una acción/ejercicio concreto y específico a este patrón exacto (usando las piezas o la fase mencionadas si las hay) — prohibido "practica más", "ten cuidado", "revisa con calma" o cualquier consejo que serviría igual para cualquier otro problema.
- Tono directo, cercano, de entrenador — no acusador ni condescendiente.
- Solo el texto final, sin comillas ni encabezados.`;

  const raw = await coachChat(prompt, { temperature: 0.5, maxTokens: 160 });
  if (!raw) return fact.message;
  let text = raw.replace(/^["“]|["”]$/g, "");
  // Soft length cap at a word boundary — never surface a sentence cut off
  // mid-word if the model overruns despite the length instruction above.
  if (text.length > 320) {
    const cut = text.slice(0, 320);
    const lastSpace = cut.lastIndexOf(" ");
    text = (lastSpace > 240 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
  }
  return text || fact.message;
}

// ─── Public API ───────────────────────────────────────────────────────────────

interface GeneratedInsight {
  category: Insight["category"];
  message: string;
  severity: Insight["severity"];
  // Facts already grounded in concrete, well-phrased specifics (real pieces/
  // squares) skip the LLM "deepen" rewrite — that step exists to de-genericize
  // the aggregate stat templates, and running it over an already-specific
  // sentence only re-introduces awkwardness/repetition. Show these verbatim.
  skipDeepen?: boolean;
}

export async function generateInsights(userId: string): Promise<void> {
  const snapshot = await buildSnapshot(userId);
  if (!snapshot) return;

  // Facts are computed directly from the player's data — deterministic and
  // always correct (see computeFacts) — then each one is deepened into a
  // fuller, less templated coach note (see deepenInsight) before saving.
  const facts = computeFacts(snapshot);
  if (facts.length === 0) return;

  const insights = await Promise.all(
    facts.map(async (f) => ({ ...f, message: f.skipDeepen ? f.message : await deepenInsight(f) }))
  );

  await supabase.from("insights").delete().eq("user_id", userId);
  await supabase.from("insights").insert(
    insights.map((ins) => ({
      user_id: userId,
      category: ins.category,
      message: ins.message,
      severity: ins.severity,
    }))
  );
}

export async function getInsights(userId: string): Promise<Insight[]> {
  const { data } = await supabase
    .from("insights")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
