-- ESTADO: PREPARADA, NO APLICADA en produccion. Pegar completa en el editor SQL de
-- Supabase y ejecutar; despues probar la app (importar, analizar, Campeones, puzzles).
--
-- 010: activar RLS en todas las tablas de public y dar al rol anon SOLO las
-- operaciones que la app usa (revisado contra el codigo, ver docs/AUDITORIA.md).
--
-- Antes: RLS estaba DESACTIVADO en 7 de 8 tablas y champion_progress tenia una
-- politica ALL, asi que cualquiera con la anon key (publica) podia borrar todo.
-- Ahora no hay DELETE salvo donde la app lo necesita (moves al re-analizar,
-- insights al regenerar) y no hay UPDATE donde nunca se usa (users).
--
-- LIMITE HONESTO: la app usa solo la anon key, asi que lo que la app puede hacer,
-- tambien lo puede hacer quien tenga esa key (leer todo, insertar y actualizar).
-- Esto evita el borrado masivo, no la lectura ni la manipulacion de datos.
-- Cerrar eso exige login real (Supabase Auth) y politicas por usuario.
--
-- Idempotente: se puede ejecutar mas de una vez. El rol postgres/service_role y el
-- editor SQL del panel no pasan por RLS.

alter table public.users enable row level security;
drop policy if exists anon_select on public.users;
drop policy if exists anon_insert on public.users;
drop policy if exists anon_update on public.users;
drop policy if exists anon_delete on public.users;
create policy anon_select on public.users for select to anon using (true);
create policy anon_insert on public.users for insert to anon with check (true);
alter table public.games enable row level security;
drop policy if exists anon_select on public.games;
drop policy if exists anon_insert on public.games;
drop policy if exists anon_update on public.games;
drop policy if exists anon_delete on public.games;
create policy anon_select on public.games for select to anon using (true);
create policy anon_insert on public.games for insert to anon with check (true);
create policy anon_update on public.games for update to anon using (true) with check (true);
alter table public.moves enable row level security;
drop policy if exists anon_select on public.moves;
drop policy if exists anon_insert on public.moves;
drop policy if exists anon_update on public.moves;
drop policy if exists anon_delete on public.moves;
create policy anon_select on public.moves for select to anon using (true);
create policy anon_insert on public.moves for insert to anon with check (true);
create policy anon_update on public.moves for update to anon using (true) with check (true);
create policy anon_delete on public.moves for delete to anon using (true);
alter table public.insights enable row level security;
drop policy if exists anon_select on public.insights;
drop policy if exists anon_insert on public.insights;
drop policy if exists anon_update on public.insights;
drop policy if exists anon_delete on public.insights;
create policy anon_select on public.insights for select to anon using (true);
create policy anon_insert on public.insights for insert to anon with check (true);
create policy anon_delete on public.insights for delete to anon using (true);
alter table public.opening_stats enable row level security;
drop policy if exists anon_select on public.opening_stats;
drop policy if exists anon_insert on public.opening_stats;
drop policy if exists anon_update on public.opening_stats;
drop policy if exists anon_delete on public.opening_stats;
create policy anon_select on public.opening_stats for select to anon using (true);
create policy anon_insert on public.opening_stats for insert to anon with check (true);
create policy anon_update on public.opening_stats for update to anon using (true) with check (true);
alter table public.puzzles enable row level security;
drop policy if exists anon_select on public.puzzles;
drop policy if exists anon_insert on public.puzzles;
drop policy if exists anon_update on public.puzzles;
drop policy if exists anon_delete on public.puzzles;
create policy anon_select on public.puzzles for select to anon using (true);
create policy anon_insert on public.puzzles for insert to anon with check (true);
create policy anon_update on public.puzzles for update to anon using (true) with check (true);
alter table public.puzzle_progress enable row level security;
drop policy if exists anon_select on public.puzzle_progress;
drop policy if exists anon_insert on public.puzzle_progress;
drop policy if exists anon_update on public.puzzle_progress;
drop policy if exists anon_delete on public.puzzle_progress;
create policy anon_select on public.puzzle_progress for select to anon using (true);
create policy anon_insert on public.puzzle_progress for insert to anon with check (true);
create policy anon_update on public.puzzle_progress for update to anon using (true) with check (true);
alter table public.champion_progress enable row level security;
drop policy if exists "Allow anon write to champion_progress" on public.champion_progress;
drop policy if exists anon_select on public.champion_progress;
drop policy if exists anon_insert on public.champion_progress;
drop policy if exists anon_update on public.champion_progress;
drop policy if exists anon_delete on public.champion_progress;
create policy anon_select on public.champion_progress for select to anon using (true);
create policy anon_insert on public.champion_progress for insert to anon with check (true);
create policy anon_update on public.champion_progress for update to anon using (true) with check (true);
