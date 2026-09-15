-- Shared "base" exercise library.
--
-- A library_exercises row with coach_id = NULL is a shared exercise,
-- visible to every coach alongside their own private ones, in the same id
-- space as the rest of library_exercises (so library_workout_exercises can
-- reference a shared or private exercise through the exact same FK, no
-- union/view needed).
--
-- There's deliberately no in-app way to create or edit a shared exercise:
-- a coach can only ever write rows they own, and coach_id = auth.uid()
-- never matches NULL, so seed/maintain these directly via the Supabase SQL
-- Editor or Table Editor, which runs as the table owner and bypasses RLS.

alter table public.library_exercises
  alter column coach_id drop not null;

-- Replace the single coach-owns-it-all policy with one read policy (own +
-- shared) and three write policies (own only).
drop policy if exists library_exercises_coach_all on public.library_exercises;

drop policy if exists library_exercises_select on public.library_exercises;
create policy library_exercises_select on public.library_exercises
  for select using (coach_id = auth.uid() or coach_id is null);

drop policy if exists library_exercises_insert_own on public.library_exercises;
create policy library_exercises_insert_own on public.library_exercises
  for insert with check (coach_id = auth.uid());

drop policy if exists library_exercises_update_own on public.library_exercises;
create policy library_exercises_update_own on public.library_exercises
  for update using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists library_exercises_delete_own on public.library_exercises;
create policy library_exercises_delete_own on public.library_exercises
  for delete using (coach_id = auth.uid());

-- Shared exercises' media has no coach_id to prefix its Storage path with,
-- so it lives under a `shared/` prefix instead of `{coach_id}/...`. Any
-- signed-in user can read it; nothing writes there through the app -- same
-- dashboard-managed posture as the rows themselves.
drop policy if exists library_media_read_shared on storage.objects;
create policy library_media_read_shared on storage.objects
  for select
  using (bucket_id = 'library-media' and (storage.foldername(name))[1] = 'shared');
