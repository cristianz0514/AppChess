-- 006 — Unambiguous per-move key
--
-- Run this once against the Supabase database (SQL Editor in the dashboard, or
-- `supabase db push` if you use the CLI). It is idempotent — safe to re-run.
--
-- Every row in `moves` used to be matched by (game_id, move_number, move) when
-- attaching classifications/evaluations/AI comments — but that key is NOT
-- unique: White's and Black's move at the same move_number can share the
-- exact same SAN (a recapture like "dxe5"/"dxe5", or "dxc5"/"dxc5",
-- "Nxg4"/"Nxg4"), so an UPDATE targeting one ply silently matched BOTH rows
-- and overwrote both with the same (only-correct-for-one-of-them) text.
-- `ply` is the 0-indexed absolute move index — genuinely unique per game —
-- and replaces that ambiguous compound key everywhere it was used.
alter table moves add column if not exists ply integer;

create index if not exists moves_game_ply_idx on moves (game_id, ply);
