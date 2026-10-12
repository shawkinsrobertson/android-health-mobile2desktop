-- Coach's dashboard task list -- simple text + done checkbox, optionally
-- traced back to the bulletin item it was generated from. Same
-- coach-owned-outright pattern as coach_notes (single `for all` policy,
-- coach_id = auth.uid()): a coach's own working list, not client-visible.

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.profiles (id) on delete cascade,
  text        text not null,
  done        boolean not null default false,
  -- Loosely-typed reference back to whatever bulletin item this task was
  -- generated from (e.g. 'message' + a chat_threads.id, 'event' + a
  -- calendar_events.id) -- nullable, since a manually-added task has no
  -- source. Deliberately not a foreign key: the source row can live in
  -- different tables depending on source_kind, and this is purely
  -- informational, never joined against.
  source_kind text,
  source_id   uuid,
  created_at  timestamptz not null default now()
);
create index if not exists tasks_coach_id_created_at_idx on public.tasks (coach_id, created_at);

alter table public.tasks enable row level security;

drop policy if exists tasks_coach_all on public.tasks;
create policy tasks_coach_all on public.tasks
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());
