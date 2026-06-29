import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import type { Insight } from "@/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface PlayerSnapshot {
  totalGames: number;
  winrate: number;
  avgAccuracy: number | null;
  blunderRate: number;
  mistakeRate: number;
  topOpenings: { name: string; games: number; winrate: number }[];
  worstOpenings: { name: string; games: number; winrate: number }[];
  earlyBlunders: number;
  lateBlunders: number;
}

async function buildSnapshot(userId: string): Promise<PlayerSnapshot | null> {
  const [gamesRes, movesRes, openingsRes] = await Promise.all([
    supabase
      .from("games")
      .select("result, accuracy")
      .eq("user_id", userId),
    supabase
      .from("moves")
      .select("game_id, move_number, classification")
      .in(
        "game_id",
        (
          await supabase
            .from("games")
            .select("id")
            .eq("user_id", userId)
        ).data?.map((g) => g.id) ?? []
      ),
    supabase
      .from("opening_stats")
      .select("opening_name, games_played, wins, losses, draws, winrate")
      .eq("user_id", userId)
      .gte("games_played", 2)
      .order("games_played", { ascending: false })
      .limit(10),
  ]);

  const games = gamesRes.data ?? [];
  const moves = movesRes.data ?? [];
  const openings = openingsRes.data ?? [];

  if (games.length === 0) return null;

  const wins = games.filter((g) => g.result === "win").length;
  const accuracies = games.map((g) => g.accuracy).filter((a): a is number => a !== null);
  const avgAccuracy = accuracies.length > 0
    ? accuracies.reduce((s, a) => s + a, 0) / accuracies.length
    : null;

  const analyzed = moves.filter((m) => m.classification !== null);
  const blunders = analyzed.filter((m) => m.classification === "blunder").length;
  const mistakes = analyzed.filter((m) => m.classification === "mistake").length;
  const total = analyzed.length;

  const earlyBlunders = moves.filter(
    (m) => m.move_number <= 10 && (m.classification === "blunder" || m.classification === "mistake")
  ).length;
  const lateBlunders = moves.filter(
    (m) => m.move_number > 20 && (m.classification === "blunder" || m.classification === "mistake")
  ).length;

  const sorted = [...openings].sort((a, b) => b.winrate - a.winrate);

  return {
    totalGames: games.length,
    winrate: Math.round((wins / games.length) * 100),
    avgAccuracy: avgAccuracy !== null ? Math.round(avgAccuracy * 10) / 10 : null,
    blunderRate: total > 0 ? Math.round((blunders / total) * 100) : 0,
    mistakeRate: total > 0 ? Math.round((mistakes / total) * 100) : 0,
    topOpenings: sorted.slice(0, 3).map((o) => ({
      name: o.opening_name,
      games: o.games_played,
      winrate: o.winrate,
    })),
    worstOpenings: sorted
      .slice(-3)
      .reverse()
      .map((o) => ({
        name: o.opening_name,
        games: o.games_played,
        winrate: o.winrate,
      })),
    earlyBlunders,
    lateBlunders,
  };
}

interface GeneratedInsight {
  category: Insight["category"];
  message: string;
  severity: Insight["severity"];
}

export async function generateInsights(userId: string): Promise<void> {
  const snapshot = await buildSnapshot(userId);
  if (!snapshot) return;

  const prompt = `You are a chess coach analyzing a blitz/rapid player's recent games. Generate exactly 4 specific coaching insights based on this data:

Player Stats:
- Total games analyzed: ${snapshot.totalGames}
- Win rate: ${snapshot.winrate}%
- Average accuracy: ${snapshot.avgAccuracy !== null ? `${snapshot.avgAccuracy}%` : "unknown"}
- Blunder rate: ${snapshot.blunderRate}% of analyzed moves
- Mistake rate: ${snapshot.mistakeRate}% of analyzed moves
- Early game errors (moves 1-10): ${snapshot.earlyBlunders} blunders/mistakes
- Late game errors (moves 21+): ${snapshot.lateBlunders} blunders/mistakes

Best openings by win rate:
${snapshot.topOpenings.map((o) => `  - ${o.name}: ${o.winrate}% win rate (${o.games} games)`).join("\n")}

Worst openings by win rate:
${snapshot.worstOpenings.map((o) => `  - ${o.name}: ${o.winrate}% win rate (${o.games} games)`).join("\n")}

Rules:
- Each insight MUST reference specific numbers from the data above.
- Never give generic advice like "study tactics" without tying it to the actual numbers.
- Be direct and actionable. One clear action per insight.
- Keep each message under 60 words.
- Use plain language, no jargon.

Return a JSON array of exactly 4 objects with these fields:
- category: one of "opening", "tactical", "time_management", "recurring_blunder"
- message: the coaching insight text
- severity: "low" (minor issue), "medium" (clear pattern), "high" (major weakness)

JSON only, no explanation:`;

  const stream = await client.messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
  });

  const response = await stream.finalMessage();

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return;

  let insights: GeneratedInsight[];
  try {
    const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    insights = JSON.parse(jsonMatch[0]);
  } catch {
    return;
  }

  if (!Array.isArray(insights) || insights.length === 0) return;

  // Delete old insights for this user before inserting fresh ones
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
