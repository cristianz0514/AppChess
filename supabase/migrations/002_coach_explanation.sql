-- 002 — AI coach comments + brilliant/great classifications
--
-- Run this once against the Supabase database (SQL Editor in the dashboard, or
-- `supabase db push` if you use the CLI). It is idempotent — safe to re-run.

-- 1) Short, precomputed AI coach comment shown inline per move.
alter table moves add column if not exists explanation text;

-- 2) The original CHECK on moves.classification rejected 'brilliant' and 'great',
--    which the analyzer now produces. Replace it with the full set.
alter table moves drop constraint if exists moves_classification_check;

alter table moves add constraint moves_classification_check
  check (classification in (
    'brilliant', 'great', 'best', 'excellent', 'good',
    'inaccuracy', 'mistake', 'blunder'
  ));
