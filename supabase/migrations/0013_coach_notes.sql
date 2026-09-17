-- Coach notes (Phase 4): a running, dated log of a coach's own notes on a
-- client -- separate from the client-facing `goals`/`limitations` fields
-- on client_profiles, which the client can see and this can't.
--
-- `is_private` is the flag PLANNING.md's Phase 4 section calls for:
-- whatever eventually builds the AI assistant coach's context (today: the
-- hand-authored system prompt in app/api/chat/route.ts; later, Phase 5's
-- tool-calling rearchitecture) must exclude private notes from it. That
-- wiring is explicitly Phase 5's job, not this migration's -- this just
-- makes the flag exist and enforced at the UI level, so nothing sensitive
-- has to wait on Phase 5 to have somewhere safe to live.
--
-- Coach-owned outright (coach_id = auth.uid(), single `for all` policy) --
-- same pattern as library_exercises etc. A client never gets a policy
-- granting them anything here, so they have no access at all, private or
-- not; that's deliberate, not an oversight -- these are the coach's own
-- notes, not a shared record.

create table if not exists public.coach_notes (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.profiles (id) on delete cascade,
  client_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null,
  is_private  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists coach_notes_coach_id_idx on public.coach_notes (coach_id);
create index if not exists coach_notes_client_id_idx on public.coach_notes (client_id);
create index if not exists coach_notes_client_id_created_at_idx on public.coach_notes (client_id, created_at desc);

alter table public.coach_notes enable row level security;

drop policy if exists coach_notes_coach_all on public.coach_notes;
create policy coach_notes_coach_all on public.coach_notes
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());
