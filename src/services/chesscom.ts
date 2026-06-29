const BASE_URL = "https://api.chess.com/pub";

const HEADERS = {
  "User-Agent": "BlunderVision/1.0 contact@blundervision.app",
};

export interface ChessComGame {
  url: string;
  pgn: string;
  time_control: string;
  end_time: number;
  rated: boolean;
  white: { username: string; rating: number; result: string };
  black: { username: string; rating: number; result: string };
}

export async function fetchRecentGames(
  username: string,
  maxGames = 50
): Promise<ChessComGame[]> {
  const now = new Date();
  const months = [
    { year: now.getFullYear(), month: now.getMonth() + 1 },
    {
      year: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
      month: now.getMonth() === 0 ? 12 : now.getMonth(),
    },
  ];

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
