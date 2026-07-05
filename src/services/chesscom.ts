const BASE_URL = "https://api.chess.com/pub";

const HEADERS = {
  "User-Agent": "AnaliChess/1.0",
};

export interface ChessComGame {
  url: string;
  pgn: string;
  time_control: string;
  time_class?: string; // 'bullet' | 'blitz' | 'rapid' | 'daily'
  end_time: number;
  rated: boolean;
  white: { username: string; rating: number; result: string };
  black: { username: string; rating: number; result: string };
}

// Fetches the player's ENTIRE game history via the monthly archives index.
// Chess.com exposes one URL per month; we fetch them all (most-recent first).
export async function fetchAllGames(username: string): Promise<ChessComGame[]> {
  const res = await fetch(`${BASE_URL}/player/${username}/games/archives`, { headers: HEADERS });
  if (!res.ok) return [];
  const { archives }: { archives?: string[] } = await res.json();
  if (!archives || archives.length === 0) return [];

  // Newest months first; fetch in small batches to be gentle with the API.
  const urls = [...archives].reverse();
  const all: ChessComGame[] = [];
  const BATCH = 6;
  for (let i = 0; i < urls.length; i += BATCH) {
    const batch = urls.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map((u) =>
        fetch(u, { headers: HEADERS })
          .then((r) => (r.ok ? r.json() : { games: [] }))
          .then((d) => (d.games ?? []) as ChessComGame[])
          .catch(() => [] as ChessComGame[]),
      ),
    );
    for (const g of results.flat()) all.push(g);
  }

  return all.sort((a, b) => b.end_time - a.end_time);
}

export async function fetchRecentGames(
  username: string,
  maxGames = 50
): Promise<ChessComGame[]> {
  const now = new Date();
  const months: { year: number; month: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const results = await Promise.all(
    months.map(({ year, month }) =>
      fetchMonthGames(username, year, month).catch(() => [] as ChessComGame[])
    )
  );

  return results
    .flat()
    .sort((a, b) => b.end_time - a.end_time)
    .slice(0, maxGames);
}

async function fetchMonthGames(
  username: string,
  year: number,
  month: number
): Promise<ChessComGame[]> {
  const mm = String(month).padStart(2, "0");
  const res = await fetch(
    `${BASE_URL}/player/${username}/games/${year}/${mm}`,
    { headers: HEADERS }
  );

  if (!res.ok) return [];

  const data = await res.json();
  return data.games ?? [];
}

export async function validateUsername(username: string): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/player/${username}`, {
    headers: HEADERS,
  });
  return res.ok;
}
