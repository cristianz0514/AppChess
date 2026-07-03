import { supabase } from "@/lib/supabase";
import { translateOpening } from "@/lib/translateOpening";
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
}

async function buildSnapshot(userId: string): Promise<PlayerSnapshot | null> {
  // Fetch game IDs first so we can join cleanly.
  const { data: gameRows } = await supabase
    .from("games")
    .select("id, result, accuracy, pgn, played_as")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

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
  };
}

// ─── Facts (deterministic, no LLM) ──────────────────────────────────────────
//
// Instead of paraphrasing stats through an LLM (which can only reword numbers
// and risks confidently-wrong chess advice), we surface the behavioral facts
// DIRECTLY from the player's data — always correct, sharp, and actionable.

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
  return chosen.map(({ weight: _w, ...rest }) => rest);
}

// ─── Public API ───────────────────────────────────────────────────────────────

interface GeneratedInsight {
  category: Insight["category"];
  message: string;
  severity: Insight["severity"];
}

export async function generateInsights(userId: string): Promise<void> {
  const snapshot = await buildSnapshot(userId);
  if (!snapshot) return;

  // Facts are computed directly from the player's data — deterministic, always
  // correct, and free (no LLM). See computeFacts for the rationale.
  const insights = computeFacts(snapshot);
  if (insights.length === 0) return;

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
