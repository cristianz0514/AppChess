import { supabase } from "@/lib/supabase";
import { fetchAllGames, validateUsername } from "./chesscom";
import { parseGames } from "./pgnParser";

export type ImportProgress = (phase: string, done: number, total: number) => void;

export async function importGames(username: string, onProgress?: ImportProgress): Promise<{
  imported: number;
  userId: string;
}> {
  onProgress?.("Verificando tu usuario de Chess.com…", 0, 1);
  const valid = await validateUsername(username);
  if (!valid) throw new Error("No encontramos ese usuario en Chess.com. Revisa que esté bien escrito.");

  const userId = await getOrCreateUser(username);
  const rawGames = await fetchAllGames(username, (done, total) => {
    onProgress?.("Descargando tu historial de Chess.com…", done, total);
  });
  const parsed = parseGames(rawGames, username);

  if (parsed.length === 0) return { imported: 0, userId };

  // NOTE: no `accuracy` field here on purpose. Upserting (update on conflict)
  // backfills time_class/played_at for games imported before those columns
  // existed, while preserving each game's already-computed accuracy.
  const rows = parsed.map((g) => ({ ...g, user_id: userId }));

  // Full history can be thousands of games (each with a full PGN). Upsert in
  // chunks so we never send a payload big enough to be rejected/timed out.
  // If the new columns aren't in the DB yet (migration not run), strip them and
  // retry so importing still works — the app degrades gracefully.
  const NEW_COLS = ["time_class", "played_at", "ended_by_abandonment"] as const;
  const CHUNK = 300;
  const totalChunks = Math.ceil(rows.length / CHUNK);
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    let { error } = await supabase.from("games").upsert(chunk, { onConflict: "chess_game_id" });
    if (error && (error.code === "42703" || /does not exist/i.test(error.message))) {
      const legacy = chunk.map((r) => {
        const c = { ...r } as Record<string, unknown>;
        for (const k of NEW_COLS) delete c[k];
        return c;
      });
      ({ error } = await supabase.from("games").upsert(legacy, { onConflict: "chess_game_id" }));
    }
    if (error) throw new Error(error.message);
    onProgress?.("Guardando tus partidas…", Math.floor(i / CHUNK) + 1, totalChunks);
  }

  onProgress?.("Actualizando tu repertorio de aperturas…", 0, 1);
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
  // Paginate: PostgREST silently caps a single response at 1000 rows, so a
  // plain unbounded select() was quietly computing wrong (truncated) totals
  // for any account past 1000 games — not just slow, actually incorrect.
  const PAGE = 1000;
  const statsMap: Record<string, { wins: number; losses: number; draws: number }> = {};

  for (let from = 0; ; from += PAGE) {
    const { data: page } = await supabase
      .from("games")
      .select("opening, result")
      .eq("user_id", userId)
      .range(from, from + PAGE - 1);
    if (!page || page.length === 0) break;

    for (const game of page) {
      const key = game.opening ?? "Unknown";
      if (!statsMap[key]) statsMap[key] = { wins: 0, losses: 0, draws: 0 };
      if (game.result === "win") statsMap[key].wins++;
      else if (game.result === "loss") statsMap[key].losses++;
      else statsMap[key].draws++;
    }
    if (page.length < PAGE) break;
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
