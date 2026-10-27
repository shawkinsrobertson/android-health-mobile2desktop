-- Primitives restructure, pass 5: Timeline (notes only -- chat is
-- deliberately excluded).
--
-- Per the design discussion: chat_threads/chat_messages/chat_message_
-- reactions (0011_chat.sql) keep their own schema. Chat earned its
-- complexity -- Supabase Realtime, bidirectional authorship, reply-
-- threading, reactions, pinning, an anti-spoofing insert check -- none of
-- which any other "timestamped entry tied to a client" needs, and it's
-- directly read/written by the Android app (ChatRepository.kt) with a
-- live postgres_changes subscription, which is exactly the kind of thing
-- not worth touching to buy a unification nothing is asking for yet.
--
-- What DOES unify: coach_notes becomes the first row shape in a generic
-- `timeline_entries` table, with an open-ended `entry_type` (no CHECK --
-- same posture as metrics.metric_type, for the same reason: a future
-- session-log or activity-feed entry type should be a new row, not a
-- migration). A per-client "everything that happened" view, if one is
-- ever built, reads this table UNION ALL chat_messages at query time --
-- that's a read-time composition, not something this migration needs to
-- build.
--
-- `is_private` keeps its name and meaning from coach_notes (AI-context
-- exclusion, per 0032_visibility_scope.sql's Phase 14 decision -- one of
-- the two sanctioned mechanisms, the boolean-column one). RLS is
-- coach-owned-outright, same as coach_notes -- every entry_type that
-- exists today is coach-only; a client-visible entry_type, if one is ever
-- added, gets its own RLS branch at that time rather than a speculative
-- one now.
--
-- Additive: coach_notes stays, ids are preserved.

create table if not exists public.timeline_entries (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.profiles (id) on delete cascade,
  client_id   uuid not null references public.profiles (id) on delete cascade,
  entry_type  text not null,
  body        text not null,
  is_private  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists timeline_entries_coach_id_idx on public.timeline_entries (coach_id);
create index if not exists timeline_entries_client_id_idx on public.timeline_entries (client_id);
create index if not exists timeline_entries_client_id_created_at_idx on public.timeline_entries (client_id, created_at desc);
create index if not exists timeline_entries_entry_type_idx on public.timeline_entries (entry_type);

alter table public.timeline_entries enable row level security;

drop policy if exists timeline_entries_coach_all on public.timeline_entries;
create policy timeline_entries_coach_all on public.timeline_entries
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

insert into public.timeline_entries (id, coach_id, client_id, entry_type, body, is_private, created_at, updated_at)
select id, coach_id, client_id, 'note', body, is_private, created_at, updated_at
from public.coach_notes
on conflict (id) do nothing;
