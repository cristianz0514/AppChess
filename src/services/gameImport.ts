import { supabase } from "@/lib/supabase";
import { fetchRecentGames, validateUsername } from "./chesscom";
import { parseGames } from "./pgnParser";

export async function importGames(username: string): Promise<{
  imported: number;
  userId: string;
}> {
  const valid = await validateUsername(username);
  if (!valid) throw new Error("Username not found on Chess.com");

  const userId = await getOrCreateUser(username);
  const rawGames = await fetchRecentGames(username);
  const parsed = parseGames(rawGames, username);

  if (parsed.length === 0) return { imported: 0, userId };

  const rows = parsed.map((g) => ({ ...g, user_id: userId, accuracy: null }));

  const { error } = await supabase
    .from("games")
    .upsert(rows, { onConflict: "chess_game_id", ignoreDuplicates: true });

  if (error) throw new Error(error.message);

  await updateOpeningStats(userId);

  return { imported: parsed.length, userId };
}

async function getOrCreateUser(username: string): Promise<string> {
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("chess_username", username.toLowerCase())
    .single();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("users")
    .insert({ chess_username: username.toLowerCase() })
    .select("id")
    .single();

  if (error || !created) throw new Error("Failed to create user");
  return created.id;
}

async function updateOpeningStats(userId: string): Promise<void> {
  const { data: games } = await supabase
    .from("games")
    .select("opening, result")
    .eq("user_id", userId);

  if (!games) return;

  const statsMap: Record<
    string,
    { wins: number; losses: number; draws: number }
  > = {};

  for (const game of games) {
    const key = game.opening ?? "Unknown";
    if (!statsMap[key]) statsMap[key] = { wins: 0, losses: 0, draws: 0 };
    if (game.result === "win") statsMap[key].wins++;
    else if (game.result === "loss") statsMap[key].losses++;
    else statsMap[key].draws++;
  }

  const rows = Object.entries(statsMap).map(([opening_name, s]) => {
    const total = s.wins + s.losses + s.draws;
    return {
      user_id: userId,
      opening_name,
      games_played: total,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      winrate: total > 0 ? Math.round((s.wins / total) * 100 * 100) / 100 : 0,
    };
  });

  await supabase
    .from("opening_stats")
    .upsert(rows, { onConflict: "user_id,opening_name" });
}
