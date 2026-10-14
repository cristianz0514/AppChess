// In-memory stand-in for "@/lib/supabase", used ONLY when OFFLINE_STUB=1 (see loader.mjs).
// analyzeGame reads one games row and writes moves / explanations / accuracy; this keeps
// all of that in process so a measurement run can read the result back and never touches
// a real database. Chainable like the real client; everything it does not know resolves
// to an empty success.
export const store: {
  game: { played_as: string; opening: string | null };
  moves: Record<string, unknown>[];
  gameUpdate: Record<string, unknown>;
} = { game: { played_as: "white", opening: null }, moves: [], gameUpdate: {} };

function builder(table: string) {
  let op: "select" | "delete" | "insert" | "update" | "upsert" = "select";
  let patch: Record<string, unknown> | null = null;
  const filters: Record<string, unknown> = {};
  const result = () => {
    if (table === "games" && op === "select") return { data: store.game, error: null };
    if (table === "games" && op === "update") { Object.assign(store.gameUpdate, patch); return { data: null, error: null }; }
    if (table === "moves" && op === "delete") { store.moves = []; return { data: null, error: null }; }
    if (table === "moves" && op === "update" && patch) {
      const row = store.moves.find((m) => m.ply === filters.ply);
      if (row) Object.assign(row, patch);
      return { data: null, error: null };
    }
    return { data: [], error: null };
  };
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = (k: string, v: unknown) => { filters[k] = v; return q; };
  q.range = () => q;
  q.single = () => Promise.resolve(result());
  q.maybeSingle = () => Promise.resolve(result());
  q.delete = () => { op = "delete"; return q; };
  q.update = (p: Record<string, unknown>) => { op = "update"; patch = p; return q; };
  q.insert = (rows: Record<string, unknown> | Record<string, unknown>[]) => {
    op = "insert";
    if (table === "moves") store.moves = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ ...r }));
    return q;
  };
  q.upsert = () => { op = "upsert"; return q; };
  q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
  return q;
}

export const supabase = { from: (t: string) => builder(t) };
