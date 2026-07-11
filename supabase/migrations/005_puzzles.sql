-- 005 — Mate practice "road trip" (numbered, sequential puzzle levels)
--
-- Run once in the Supabase SQL Editor (idempotent).

-- Puzzles are global (not per-user) EXCEPT for source='user_game' ones, which
-- are mined from a specific player's own analyzed games (personalized).
create table if not exists puzzles (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('lichess', 'user_game')),
  external_id text,                          -- lichess puzzle id, for dedup
  user_id uuid references users(id) on delete cascade,   -- set only for source='user_game'
  game_id uuid references games(id) on delete set null,  -- set only for source='user_game'
  fen text not null,                         -- position the player must solve FROM (their move)
  solution jsonb not null,                   -- array of UCI moves, e.g. ["d5b6"] or ["b1b8","e1e8","b8e8"]
  mate_in int not null check (mate_in in (1, 2)),
  rating int,                                -- lichess difficulty rating, null for user_game
  order_index int not null,                  -- fixed position in the road trip (per mate_in level)
  created_at timestamptz not null default now(),
  unique (source, external_id)
);

-- Per-user progress through the road trip.
create table if not exists puzzle_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  puzzle_id uuid not null references puzzles(id) on delete cascade,
  solved boolean not null default false,
  attempts int not null default 0,
  solved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, puzzle_id)
);

create index if not exists puzzles_mate_in_order_idx on puzzles(mate_in, order_index);
create index if not exists puzzles_user_id_idx on puzzles(user_id) where user_id is not null;
create index if not exists puzzle_progress_user_id_idx on puzzle_progress(user_id);
