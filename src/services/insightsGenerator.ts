import Groq from "groq-sdk";
import { supabase } from "@/lib/supabase";
import { translateOpening } from "@/lib/translateOpening";
import type { Insight } from "@/types";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(s: PlayerSnapshot): string {
  const pct = (n: number, total: number) =>
    total > 0 ? `${Math.round((n / total) * 100)}%` : "0%";

  const timePressureSection = s.hasClockData
    ? `Time Pressure (from clock annotations):
- Games where clock fell below 30s: ${s.timePressureGames} of ${s.totalGames}
- Blunders/mistakes during time pressure: ${s.timePressureBlunders}
- Total errors in those games: ${s.totalBlundersInTimeGames}
- Time pressure error rate: ${pct(s.timePressureBlunders, s.totalBlundersInTimeGames)} of errors occurred under 30s`
    : `Time Pressure: no clock data available for this player's games`;

  return `Eres un entrenador de ajedrez experto. Un jugador tiene ${s.totalGames} partidas recientes de blitz/rapid en nuestra base de datos.
Genera exactamente 4 consejos de entrenamiento cubriendo estas tres áreas. Cada consejo debe basarse en los números específicos a continuación.
IMPORTANTE: Responde SIEMPRE en español.

═══════════════════════════════════
PLAYER DATA
═══════════════════════════════════

General:
- Win rate: ${s.winrate}%
- Avg accuracy: ${s.avgAccuracy !== null ? `${s.avgAccuracy}%` : "not yet calculated"}
- Total blunders: ${s.totalBlunders} | Total mistakes: ${s.totalMistakes}

Opening Habits:
- Games with an early queen move (before move 6): ${s.earlyQueenGames} of ${s.totalGames}
- Games with passive opening (fewer than 3 piece development moves in first 10): ${s.lowDevelopmentGames} of ${s.totalGames}
- Best openings by win rate: ${s.topOpenings.map((o) => `${o.name} ${o.winrate}% (${o.games}g)`).join(", ")}
- Worst openings by win rate: ${s.worstOpenings.map((o) => `${o.name} ${o.winrate}% (${o.games}g)`).join(", ")}

${timePressureSection}

Tactical Weaknesses:
- Blunders by phase — opening (moves 1–10): ${s.blundersByPhase.opening}, middlegame (11–25): ${s.blundersByPhase.middlegame}, endgame (26+): ${s.blundersByPhase.endgame}
- Severe blunders (>300 centipawns lost): ${s.severeBlunders}
- Peak error zone: ${s.peakBlunderMoveRange ?? "spread evenly"}

═══════════════════════════════════
RULES — READ CAREFULLY
═══════════════════════════════════

✅ DEBES:
- Mencionar los números exactos de los datos en cada consejo.
- Cubrir al menos 2 de las 3 áreas (hábitos de apertura, presión de tiempo, debilidades tácticas).
- Dar UNA instrucción específica y accionable por consejo.
- Sonar personal, como un entrenador que estudió las partidas de este jugador específico.

❌ NUNCA:
- Dar consejos que apliquen a cualquier jugador ("estudia táctica", "ten más cuidado").
- Repetir el mismo consejo en dos insights diferentes.
- Mencionar categorías o etiquetas en el texto del mensaje.
- Usar jerga sin explicarla en lenguaje sencillo.

FORMATO DE RESPUESTA:
Devuelve un array JSON de exactamente 4 objetos. Los mensajes deben estar en español, máximo 70 palabras, tono personal como un entrenador:
[
  {
    "category": "opening" | "tactical" | "time_management" | "recurring_blunder",
    "message": "...(máximo 70 palabras, en español, tono personal de entrenador)...",
    "severity": "low" | "medium" | "high"
  }
]

Solo JSON — sin explicaciones, sin markdown, sin texto adicional:`;
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

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content:
          "Eres un entrenador de ajedrez experto. DEBES responder ÚNICAMENTE en español. Nunca respondas en inglés ni en ningún otro idioma. Solo español.",
      },
      { role: "user", content: buildPrompt(snapshot) },
    ],
    max_tokens: 1200,
    temperature: 0.7,
  });
  const text = completion.choices[0]?.message?.content ?? "";

  let insights: GeneratedInsight[];
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    insights = JSON.parse(jsonMatch[0]);
  } catch {
    return;
  }

  if (!Array.isArray(insights) || insights.length === 0) return;

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
