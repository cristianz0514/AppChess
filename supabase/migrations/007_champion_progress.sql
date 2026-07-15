-- 007 — Progress tracking for "Nacimiento de un Campeón"
--
-- Run this once against the Supabase database (SQL Editor in the dashboard, or
-- `supabase db push` if you use the CLI). It is idempotent — safe to re-run.

create table if not exists champion_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  champion_id text not null,
  chapter_id text not null,
  result text not null check (result in ('win', 'loss', 'draw')),
  completed_at timestamptz not null default now(),
  unique (user_id, champion_id, chapter_id)
);

create index if not exists champion_progress_user_idx on champion_progress (user_id);
