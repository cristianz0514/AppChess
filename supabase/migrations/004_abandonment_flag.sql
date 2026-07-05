-- 004 — precomputed abandonment flag (perf)
--
-- Run once in the Supabase SQL Editor (idempotent).
--
-- getResultStats used to pull every game's full PGN on each dashboard load just
-- to detect disconnection/abandonment. Over the full history that's huge. We now
-- compute it once at import time and store the boolean here.
alter table games add column if not exists ended_by_abandonment boolean not null default false;
