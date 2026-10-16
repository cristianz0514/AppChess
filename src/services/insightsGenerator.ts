import { Chess } from "chess.js";
import { supabase } from "@/lib/supabase";
import { translateOpening } from "@/lib/translateOpening";
import { detectMotifs } from "@/lib/tacticalMotifs";
import { isChampionBattle, isOwnPly, isOwnRow } from "@/lib/ownGames";
import { getMovesOfGames, getOpeningsByColor, hasModernSchema, hasPlyColumn } from "./dashboardData";
import type { Insight } from "@/types";

// ─── Clock parsing ────────────────────────────────────────────────────────────

// Returns remaining seconds for each half-move (ply) in the order they appear in PGN.
// Chess.com encodes: 1. e4 { [%clk 0:10:00] } 1... e5 { [%clk 0:09:58.3] }
// The seconds carry tenths ("0:03:00.5") on fast games; a pattern that only took whole
// seconds skipped those entries and shifted every later clock one ply earlier.
export function parsePgnClocks(pgn: string): number[] {
  const times: number[] = [];
  const re = /\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pgn)) !== null) {
    times.push(parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]));
  }
  return times;
}

// The plies at which the PLAYER's own clock was under 30s. The PGN lists both clocks in move
// order; the rival's low clock says nothing about the player's time.
export function timePressurePlies(clocks: number[], playedAs: "white" | "black"): Set<number> {
  const pressurePlies = new Set<number>();
  for (let i = 0; i < clocks.length; i++) {
    if (isOwnPly(i, playedAs) && clocks[i] < 30) pressurePlies.add(i);
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

/** One game and how many times it contributes to a figure (errors, hung pieces, …). */
export interface GameCount { id: string; count: number }

/** The rows each figure was counted from, so a notice and its related games always agree. */
export interface GamesBehind {
  info: Record<string, { opening: string | null; result: "win" | "loss" | "draw" }>;
  errors: Record<string, number>;               // the player's own errors per game
  earlyQueen: GameCount[];                      // count = move number of the first queen move
  lowDevelopment: GameCount[];                  // count = knights/bishops moved in the first 10
  timePressure: GameCount[];                    // errors made with the own clock under 30s
  hung: GameCount[];                            // pieces left undefended
  phase: Record<keyof BlunderPhases, GameCount[]>; // blunders per phase
  peak: GameCount[];                            // errors inside the peak window
  severe: GameCount[];                          // moves that gave away more than 3 points
  openingGames: Record<string, string[]>;       // opening name (as stored) → game ids
}

export interface PlayerSnapshot {
  totalGames: number;
  analyzedGames: number;          // games with saved moves: the base of the per-game habits
  winrate: number;
  avgAccuracy: number | null;

  // Opening habits
  topOpenings: { name: string; raw: string; games: number; winrate: number }[];
  worstOpenings: { name: string; raw: string; games: number; winrate: number }[];
  earlyQueenGames: number;        // games with a queen move before move 6
  lowDevelopmentGames: number;    // games with <3 N/B moves in first 10 plies

  // Time pressure
  hasClockData: boolean;
  timePressureGames: number;      // games where the player's clock fell below 30s
  timePressureBlunders: number;   // errors that occurred during time pressure
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
  hungPieces: { piece: string; square: string; opening: string | null; phase: keyof BlunderPhases; gameId: string }[];

  behind: GamesBehind;
}

const tally = (rows: { game_id: string }[]): GameCount[] => {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.game_id, (counts.get(r.game_id) ?? 0) + 1);
  return [...counts].map(([id, count]) => ({ id, count }));
};

async function buildSnapshot(userId: string): Promise<PlayerSnapshot | null> {
  // Fetch game IDs first so we can join cleanly.
  // Order by real play date (played_at) when the column exists; else by import
  // time. created_at is identical across a full-history batch, so played_at is
  // preferred, but the query must not fail if the migration hasn't run.
  // Reuses dashboardData's cache()-memoized probe instead of re-querying —
  // a dashboard load calls both this and getDashboardStats in the same request.
  const orderCol = (await hasModernSchema()) ? "played_at" : "created_at";
  const { data: allGameRows } = await supabase
    .from("games")
    .select("id, result, accuracy, pgn, played_as, opening, chess_game_id")
    .eq("user_id", userId)
    .order(orderCol, { ascending: false, nullsFirst: true }) // matches games_user_played_at_idx (faster)
    .limit(50);

  // Champion battles are not rated games against a real rival: they say nothing about the
  // player's habits.
  const gameRows = (allGameRows ?? []).filter((g) => !isChampionBattle(g.chess_game_id));
  if (gameRows.length === 0) return null;

  const gameIds = gameRows.map((g) => g.id);

  type MoveRow = { game_id: string; ply?: number | null; move_number: number; move: string | null; centipawn_loss: number | null; classification: string | null };
  const [allMoves, openingsRes] = await Promise.all([
    // Both sides' moves are saved: everything below is about the player's own, so the rival's
    // are dropped here (see isOwnRow). A "tus errores" figure must not count the rival's.
    getMovesOfGames<MoveRow>(
      gameIds,
      (await hasPlyColumn()) ? "game_id, ply, move_number, move, centipawn_loss, classification" : "game_id, move_number, move, centipawn_loss, classification",
    ),
    // The same figures the Aperturas tab shows (its window of games, not the all-time table
    // that only this screen read), so a notice and the tab never quote different numbers.
    getOpeningsByColor(userId, "both"),
  ]);

  const sideOf = new Map(gameRows.map((g) => [g.id, g.played_as === "black" ? "black" : "white"] as const));
  const moves = allMoves.filter((m) => isOwnRow(m, sideOf.get(m.game_id) ?? "white"));
  const openings = openingsRes.slice(0, 12);

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

  const earlyQueen: GameCount[] = [];
  const lowDevelopment: GameCount[] = [];

  for (const [id, gameMoves] of movesByGame) {
    const queenMoves = gameMoves.filter((m) => m.move_number <= 5 && m.move !== null && isQueenMove(m.move));
    if (queenMoves.length > 0) earlyQueen.push({ id, count: Math.min(...queenMoves.map((m) => m.move_number)) });

    const first10 = gameMoves.filter((m) => m.move_number <= 10);
    const devCount = first10.filter((m) => m.move !== null && isDevelopmentMove(m.move)).length;
    if (devCount < 3) lowDevelopment.push({ id, count: devCount });
  }

  // ── Tactical weaknesses ───────────────────────────────────────────────────
  const analyzed = moves.filter((m) => m.classification !== null);
  const blunders = analyzed.filter((m) => m.classification === "blunder");
  const mistakes = analyzed.filter((m) => m.classification === "mistake");

  const inPhase = {
    opening:    (m: MoveRow) => m.move_number <= 10,
    middlegame: (m: MoveRow) => m.move_number > 10 && m.move_number <= 25,
    endgame:    (m: MoveRow) => m.move_number > 25,
  };
  const blundersByPhase: BlunderPhases = {
    opening:    blunders.filter(inPhase.opening).length,
    middlegame: blunders.filter(inPhase.middlegame).length,
    endgame:    blunders.filter(inPhase.endgame).length,
  };

  const severeMoves = analyzed.filter((m) => m.centipawn_loss !== null && m.centipawn_loss > 300);
  const severeBlunders = severeMoves.length;

  // Find the 8-move window with the most blunders+mistakes.
  const errors = [...blunders, ...mistakes];
  let peakBlunderMoveRange: string | null = null;
  let peakErrors: MoveRow[] = [];
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
      peakErrors = errors.filter((e) => e.move_number >= bestStart && e.move_number < bestStart + 8);
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
    if (!game.pgn) continue;
    const playerColor = game.played_as === "white" ? "w" : "b";
    // Only this game's OWN blunder/mistake moves (the rival's were dropped above), by ply
    // when the row has one, else by (move_number, SAN).
    const ownErrors = (movesByGame.get(game.id) ?? [])
      .filter((m) => (m.classification === "blunder" || m.classification === "mistake") && m.move);
    const errPlies = new Set(ownErrors.filter((m) => m.ply != null).map((m) => m.ply!));
    const errs = new Set(ownErrors.filter((m) => m.ply == null).map((m) => `${m.move_number}:${m.move}`));
    if (errPlies.size === 0 && errs.size === 0) continue;
    const chess = new Chess();
    try { chess.loadPgn(game.pgn); } catch { continue; }
    const hist = chess.history({ verbose: true });
    for (let ply = 0; ply < hist.length; ply++) {
      const h = hist[ply];
      if (h.color !== playerColor) continue;
      const moveNumber = Math.floor(ply / 2) + 1;
      if (!errPlies.has(ply) && !errs.has(`${moveNumber}:${h.san}`)) continue;
      const selfHang = detectMotifs(h.before, h.san).find((mo) => mo.key === "hangs_own");
      if (selfHang?.pieceName && selfHang.square) {
        hungPieces.push({
          piece: selfHang.pieceName,
          square: selfHang.square,
          opening: game.opening ? translateOpening(game.opening) : null,
          phase: phaseOf(moveNumber),
          gameId: game.id,
        });
      }
    }
  }

  // ── Time pressure (from PGN clock annotations) ────────────────────────────
  let timePressureGames = 0;
  let timePressureBlunders = 0;
  let totalBlundersInTimeGames = 0;
  let hasClockData = false;
  const timePressure: GameCount[] = [];

  for (const game of gameRows) {
    const clocks = parsePgnClocks(game.pgn ?? "");
    if (clocks.length === 0) continue;
    hasClockData = true;

    const playedAs = game.played_as === "black" ? "black" : "white";
    const pressurePlies = timePressurePlies(clocks, playedAs);
    const inTimePressure = pressurePlies.size > 0;

    if (!inTimePressure) continue;
    timePressureGames++;

    const gameBlunders = (movesByGame.get(game.id) ?? []).filter(
      (m) => m.classification === "blunder" || m.classification === "mistake"
    );
    totalBlundersInTimeGames += gameBlunders.length;

    // A move_number maps to ply index: white move N = ply (2N-2), black = ply (2N-1).
    // The error was made under pressure if the player's clock was under 30s after it or
    // before it (their previous move, two plies back).
    let underPressure = 0;
    for (const m of gameBlunders) {
      const ply = m.ply ?? (playedAs === "white" ? (m.move_number - 1) * 2 : (m.move_number - 1) * 2 + 1);
      if (pressurePlies.has(ply) || pressurePlies.has(ply - 2)) underPressure++;
    }
    timePressureBlunders += underPressure;
    if (underPressure > 0) timePressure.push({ id: game.id, count: underPressure });
  }

  // ── Openings ranking ──────────────────────────────────────────────────────
  const sorted = [...openings].sort((a, b) => b.winrate - a.winrate);
  const asOpening = (o: (typeof sorted)[number]) => ({
    name: translateOpening(o.opening_name),
    raw: o.opening_name,
    games: o.games_played,
    winrate: o.winrate,
  });

  const openingGames: Record<string, string[]> = {};
  for (const g of gameRows) {
    if (!g.opening) continue;
    (openingGames[g.opening] ??= []).push(g.id);
  }

  const ownErrorRows = moves.filter((m) => m.classification === "blunder" || m.classification === "mistake");

  return {
    totalGames: gameRows.length,
    analyzedGames: movesByGame.size,
    winrate: Math.round((wins / gameRows.length) * 100),
    avgAccuracy,

    topOpenings: sorted.slice(0, 3).map(asOpening),
    worstOpenings: sorted.slice(-3).reverse().map(asOpening),
    earlyQueenGames: earlyQueen.length,
    lowDevelopmentGames: lowDevelopment.length,

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

    behind: {
      info: Object.fromEntries(gameRows.map((g) => [g.id, { opening: g.opening ?? null, result: g.result as "win" | "loss" | "draw" }])),
      errors: Object.fromEntries(tally(ownErrorRows).map((c) => [c.id, c.count])),
      earlyQueen,
      lowDevelopment,
      timePressure,
      hung: tally(hungPieces.map((h) => ({ game_id: h.gameId }))),
      phase: {
        opening: tally(blunders.filter(inPhase.opening)),
        middlegame: tally(blunders.filter(inPhase.middlegame)),
        endgame: tally(blunders.filter(inPhase.endgame)),
      },
      peak: tally(peakErrors),
      severe: tally(severeMoves),
      openingGames,
    },
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function computeFacts(s: PlayerSnapshot): GeneratedInsight[] {
  const facts: Fact[] = [];
  const phaseEs = { opening: "la apertura", middlegame: "el medio juego", endgame: "el final" } as const;

  // The games a notice comes from, with what each one contributes. Built from the same rows the
  // figure was counted from. `order`: biggest contribution first, or earliest first.
  const related = (list: GameCount[], detail: (n: number) => string, order: "most" | "least" = "most"): RelatedGame[] =>
    [...list]
      .filter((g) => s.behind.info[g.id])
      .sort((a, b) => (order === "most" ? b.count - a.count : a.count - b.count))
      .slice(0, 5)
      .map((g) => ({
        id: g.id,
        opening: s.behind.info[g.id].opening ?? "Desconocida",
        result: s.behind.info[g.id].result,
        detail: detail(g.count),
      }));
  const errorsDetail = (n: number) => plural(n, "error", "errores");

  // 1. Time pressure — the clearest behavioral pattern when clock data exists.
  if (s.hasClockData && s.totalBlundersInTimeGames >= 3) {
    const share = Math.round((s.timePressureBlunders / s.totalBlundersInTimeGames) * 100);
    if (share >= 30) {
      facts.push({
        category: "time_management",
        message: `El ${share}% de tus errores (${s.timePressureBlunders} de ${s.totalBlundersInTimeGames}) llegan con menos de 30s en el reloj. Juega la apertura más rápido para guardar tiempo.`,
        severity: share >= 50 ? "high" : "medium",
        games: related(s.behind.timePressure, (n) => plural(n, "error con poco tiempo", "errores con poco tiempo")),
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
    facts.push({
      category: "recurring_blunder", message, severity: n >= 6 ? "high" : "medium",
      games: related(s.behind.hung, (k) => plural(k, "pieza colgada", "piezas colgadas")),
      weight: 95 + n,
    });
  }

  // 2. Peak error window — where in the game your mistakes cluster.
  if (s.peakBlunderMoveRange) {
    const range = s.peakBlunderMoveRange.replace("moves", "las jugadas");
    facts.push({
      category: "tactical",
      message: `Tu zona de mayor error es ${range}: es donde más se te escapan las partidas. Revísalas con calma.`,
      severity: "medium",
      games: related(s.behind.peak, (n) => `${plural(n, "error", "errores")} en esa zona`),
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
      games: related(s.behind.phase[topPhase[0]], (n) => plural(n, "error grave", "errores graves")),
      weight: 60 + topPhase[1],
    });
  }

  // 4. Weakest opening (needs a real sample).
  const worst = s.worstOpenings.find((o) => o.games >= 3 && o.winrate < 45);
  if (worst) {
    facts.push({
      category: "opening",
      message: `Con ${worst.name} solo ganas ${Math.round(worst.winrate)}% (${worst.games} partidas) — es tu apertura más floja. Estúdiala o cámbiala.`,
      severity: worst.winrate < 30 ? "high" : "medium",
      games: related((s.behind.openingGames[worst.raw] ?? []).map((id) => ({ id, count: s.behind.errors[id] ?? 0 })), errorsDetail),
      weight: 65 + (45 - worst.winrate),
    });
  }

  // 5. Early-queen habit.
  if (s.earlyQueenGames >= Math.max(4, s.analyzedGames * 0.15)) {
    facts.push({
      category: "opening",
      message: `Sacas la dama antes de la jugada 6 en ${s.earlyQueenGames} partidas: la expones a ataques que te hacen perder tiempo.`,
      severity: "low",
      games: related(s.behind.earlyQueen, (n) => `dama en la jugada ${n}`, "least"),
      weight: 40 + s.earlyQueenGames,
    });
  }

  // 6. Passive development.
  if (s.lowDevelopmentGames >= Math.max(4, s.analyzedGames * 0.2)) {
    facts.push({
      category: "opening",
      message: `En ${s.lowDevelopmentGames} partidas desarrollaste menos de 3 piezas en las primeras 10 jugadas. Prioriza sacar caballos y alfiles.`,
      severity: "low",
      games: related(s.behind.lowDevelopment, (n) => `${plural(n, "pieza desarrollada", "piezas desarrolladas")} en 10 jugadas`, "least"),
      weight: 38 + s.lowDevelopmentGames,
    });
  }

  // 7. Severe blunders fallback (if we still have few facts).
  if (s.severeBlunders >= 3) {
    facts.push({
      category: "tactical",
      message: `${s.severeBlunders} veces regalaste más de 3 puntos de ventaja en una sola jugada. Antes de mover, revisa capturas y jaques del rival.`,
      severity: s.severeBlunders >= 10 ? "high" : "medium",
      games: related(s.behind.severe, (n) => `${plural(n, "jugada", "jugadas")} de más de 3 puntos`),
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
    games: f.games,
  }));
}

// NOTE: an LLM "deepen" step used to rewrite each finished insight into warmer
// prose. It is gone, and the reason is the one /api/explain already recorded when
// it dropped its own model call: a model-written sentence among template-written
// ones reads like a different person wrote it, and consistency across the app
// matters more than any single sentence. It was also the only thing in the project
// that could not run without a server, since an API key cannot live in the client.
//
// Nothing is lost in substance. computeFacts() produces the verified
// sentence; deepening only reworded it, and already fell back to that same
// sentence whenever the key was missing or the call failed — so this is the path
// that was already running in every failure case.
//
// If the wording reads repetitive, the fix is the one that worked for
// lib/coachComment today: several variants per fact chosen deterministically, not
// a model. A template can be proven correct; a rewrite has to be trusted.

// ─── Public API ───────────────────────────────────────────────────────────────

/** A game behind a notice, with what it contributes ("2 errores con poco tiempo"). */
export interface RelatedGame {
  id: string;
  opening: string;
  result: "win" | "loss" | "draw";
  detail: string;
}

export interface GeneratedInsight {
  category: Insight["category"];
  message: string;
  severity: Insight["severity"];
  games: RelatedGame[];
}

/**
 * The coach's notices, computed from the player's games AT THE MOMENT of the request.
 * They used to be stored in a table by a "Generar" button, so the page showed whatever was
 * saved the last time someone pressed it — stale after every new analysis — and nothing
 * regenerated them on its own.
 */
export async function getCoachInsights(userId: string): Promise<{ insights: GeneratedInsight[]; analyzedGames: number }> {
  const snapshot = await buildSnapshot(userId);
  if (!snapshot) return { insights: [], analyzedGames: 0 };
  return { insights: computeFacts(snapshot), analyzedGames: snapshot.analyzedGames };
}
