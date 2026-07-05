-- 003 — separate stats by time control + real game date + full history
--
-- Run once in the Supabase SQL Editor (idempotent).

-- Time control class from Chess.com: 'bullet' | 'blitz' | 'rapid' | 'daily'.
-- Lets the dashboard show ratings/stats per type instead of mixing them.
alter table games add column if not exists time_class text;

-- The real moment the game was played (Chess.com end_time). created_at is only
-- the import time, which is useless for ordering when the whole history is
-- imported at once — ELO evolution and "current rating" need the real date.
alter table games add column if not exists played_at timestamptz;

create index if not exists games_user_time_class_idx on games(user_id, time_class);
create index if not exists games_user_played_at_idx on games(user_id, played_at desc);
