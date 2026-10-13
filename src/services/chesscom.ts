const BASE_URL = "https://api.chess.com/pub";

// chess.com asks API clients to identify themselves; an anonymous generic agent
// is the first thing it throttles.
const HEADERS = {
  "User-Agent": "AnaliChess/1.0 (+https://github.com/cristianz0514/AppChess)",
  Accept: "application/json",
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

// Thrown when chess.com itself can't answer (rate limit, block, outage) — a
// different situation from "that user doesn't exist", which used to be
// reported identically ("No encontramos ese usuario") and sent people hunting
// for a typo in a correctly spelled name.
export class ChessComUnavailableError extends Error {
  constructor() {
    super("Chess.com no está respondiendo en este momento (puede estar limitando las consultas). Espera un minuto e inténtalo de nuevo.");
  }
}

const RETRY_STATUSES = new Set([403, 429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// fetch with a few retries for the statuses that are usually temporary (429 and
// 5xx, plus 403 which shared hosting IPs get from chess.com's edge). Network
// errors are retried too. Returns the last response so callers can tell 404
// (really not there) from a persistent failure.
export async function chessFetch(url: string, attempts = 3): Promise<Response | null> {
  let last: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!RETRY_STATUSES.has(res.status)) return res;
      last = res;
    } catch {
      last = null;
    }
    if (i < attempts - 1) await sleep(700 * (i + 1));
  }
  return last;
}

// Fetches the player's ENTIRE game history via the monthly archives index.
// Chess.com exposes one URL per month; we fetch them all (most-recent first).
// A large account can span many years of archives — `onProgress` lets the
// caller show real feedback instead of a frozen-looking screen.
//
// A month that still fails after the retries throws instead of being skipped:
// silently dropping it would present a partial history as the complete one, and
// the import is an idempotent upsert, so trying again is always safe.
export async function fetchAllGames(
  username: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ChessComGame[]> {
  const res = await chessFetch(`${BASE_URL}/player/${encodeURIComponent(username)}/games/archives`);
  if (!res) throw new ChessComUnavailableError();
  if (res.status === 404) return [];
  if (!res.ok) throw new ChessComUnavailableError();
  const { archives }: { archives?: string[] } = await res.json();
  if (!archives || archives.length === 0) return [];

  // Newest months first; fetch in small batches to be gentle with the API.
  const urls = [...archives].reverse();
  const all: ChessComGame[] = [];
  const BATCH = 6;
  onProgress?.(0, urls.length);
  for (let i = 0; i < urls.length; i += BATCH) {
    const batch = urls.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (u) => {
        const r = await chessFetch(u);
        if (!r || !r.ok) throw new ChessComUnavailableError();
        const d = await r.json();
        return (d.games ?? []) as ChessComGame[];
      }),
    );
    for (const g of results.flat()) all.push(g);
    onProgress?.(Math.min(i + BATCH, urls.length), urls.length);
  }

  return all.sort((a, b) => b.end_time - a.end_time);
}

// Games from the last `months` calendar months (current one included), newest
// first. Best-effort on purpose: a month chess.com won't answer for is skipped,
// not fatal — this is what refreshes a RETURNING user, whose history is already
// stored, so a partial answer (or none) must never block them from signing in.
export async function fetchRecentMonths(username: string, months = 3): Promise<ChessComGame[]> {
  const now = new Date();
  const list: { year: number; month: number }[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    list.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  const results = await Promise.all(
    list.map(({ year, month }) => fetchMonthGames(username, year, month).catch(() => [] as ChessComGame[])),
  );
  return results.flat().sort((x, y) => y.end_time - x.end_time);
}

async function fetchMonthGames(
  username: string,
  year: number,
  month: number
): Promise<ChessComGame[]> {
  const mm = String(month).padStart(2, "0");
  const res = await chessFetch(`${BASE_URL}/player/${encodeURIComponent(username)}/games/${year}/${mm}`);

  if (!res || !res.ok) return [];

  const data = await res.json();
  return data.games ?? [];
}

export type UsernameCheck = "ok" | "not_found" | "unavailable";

// "not_found" only on a real 404; anything else that isn't a 200 is chess.com
// being unable to answer, which must not be reported as a bad username.
export async function validateUsername(username: string): Promise<UsernameCheck> {
  const res = await chessFetch(`${BASE_URL}/player/${encodeURIComponent(username)}`);
  if (!res) return "unavailable";
  if (res.ok) return "ok";
  if (res.status === 404 || res.status === 410) return "not_found";
  return "unavailable";
}
