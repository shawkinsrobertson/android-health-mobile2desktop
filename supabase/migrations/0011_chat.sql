-- Coach <-> client messaging (chat v1: text, emoji, links, photo/video/audio
-- attachments, replies, reactions, pinning). Calling is explicitly out of
-- scope for this phase -- see PLANNING.md notes.
--
-- One thread per coach-client relationship (matches the 1:1 relationship
-- already encoded by client_profiles.coach_id) -- no thread list/creation
-- UI, so a single `unique (coach_id, client_id)` row is enough. Unread
-- state is tracked as a per-side "last read" timestamp on the thread
-- itself, compared against last_message_at/last_sender_id (both
-- denormalized onto the thread row so an unread dot never needs to scan
-- chat_messages) -- see dashboard/lib/chat.ts.
--
-- RLS follows the dual-ownership pattern used throughout this project
-- (e.g. 0009_workout_sessions.sql): every table denormalizes coach_id AND
-- client_id so policies never need a join, and both participants get full
-- select. Unlike most of this project's tables, chat_threads' insert
-- policy is NOT a flat auth.uid() check -- it additionally verifies the
-- coach_id/client_id pair matches a real client_profiles relationship, so
-- a signed-in client can't fabricate a thread against an arbitrary
-- coach_id (defense in depth, same spirit as the assignment RPC
-- ownership fix in 0007).

create table if not exists public.chat_threads (
  id                   uuid primary key default gen_random_uuid(),
  coach_id             uuid not null references public.profiles (id) on delete cascade,
  client_id            uuid not null references public.profiles (id) on delete cascade,
  last_message_at      timestamptz,
  last_sender_id       uuid references public.profiles (id) on delete set null,
  coach_last_read_at   timestamptz,
  client_last_read_at  timestamptz,
  created_at           timestamptz not null default now(),
  unique (coach_id, client_id)
);
create index if not exists chat_threads_coach_id_idx on public.chat_threads (coach_id);
create index if not exists chat_threads_client_id_idx on public.chat_threads (client_id);

create table if not exists public.chat_messages (
  id                           uuid primary key default gen_random_uuid(),
  thread_id                    uuid not null references public.chat_threads (id) on delete cascade,
  coach_id                     uuid not null references public.profiles (id) on delete cascade,
  client_id                    uuid not null references public.profiles (id) on delete cascade,
  sender_id                    uuid not null references public.profiles (id) on delete cascade,
  sender_role                  text not null check (sender_role in ('coach', 'client')),
  body                         text,
  reply_to_id                  uuid references public.chat_messages (id) on delete set null,
  -- One attachment slot per message (unlike library media's photo+video
  -- pair) -- chat messages are either text, an attachment, or both.
  attachment_kind              text check (attachment_kind in ('image', 'video', 'audio')),
  attachment_path              text,
  attachment_mime              text,
  attachment_duration_seconds  integer,
  pinned_at                    timestamptz,
  pinned_by                    uuid references public.profiles (id) on delete set null,
  created_at                   timestamptz not null default now(),
  constraint chat_messages_body_or_attachment check (body is not null or attachment_path is not null),
  constraint chat_messages_attachment_shape check (
    (attachment_kind is null and attachment_path is null) or
    (attachment_kind is not null and attachment_path is not null)
  )
);
create index if not exists chat_messages_thread_id_created_at_idx on public.chat_messages (thread_id, created_at);
create index if not exists chat_messages_coach_id_idx on public.chat_messages (coach_id);
create index if not exists chat_messages_client_id_idx on public.chat_messages (client_id);

create table if not exists public.chat_message_reactions (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.chat_messages (id) on delete cascade,
  coach_id    uuid not null references public.profiles (id) on delete cascade,
  client_id   uuid not null references public.profiles (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  unique (message_id, profile_id, emoji)
);
create index if not exists chat_message_reactions_message_id_idx on public.chat_message_reactions (message_id);

-- ---------------------------------------------------------------------------
-- Storage: private bucket for chat attachments (separate from
-- library-media, since access here is two-party-per-thread rather than
-- coach-owned). Path convention: {thread_id}/{uuid}-{filename}.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do nothing;

drop policy if exists chat_media_participants_all on storage.objects;
create policy chat_media_participants_all on storage.objects
  for all
  using (
    bucket_id = 'chat-media'
    and exists (
      select 1 from public.chat_threads t
      where t.id::text = (storage.foldername(name))[1]
        and (t.coach_id = auth.uid() or t.client_id = auth.uid())
    )
  )
  with check (
    bucket_id = 'chat-media'
    and exists (
      select 1 from public.chat_threads t
      where t.id::text = (storage.foldername(name))[1]
        and (t.coach_id = auth.uid() or t.client_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_message_reactions enable row level security;

drop policy if exists chat_threads_select on public.chat_threads;
create policy chat_threads_select on public.chat_threads
  for select using (coach_id = auth.uid() or client_id = auth.uid());

drop policy if exists chat_threads_insert on public.chat_threads;
create policy chat_threads_insert on public.chat_threads
  for insert with check (
    (coach_id = auth.uid() or client_id = auth.uid())
    and exists (
      select 1 from public.client_profiles cp
      where cp.profile_id = client_id and cp.coach_id = coach_id
    )
  );

drop policy if exists chat_threads_update on public.chat_threads;
create policy chat_threads_update on public.chat_threads
  for update using (coach_id = auth.uid() or client_id = auth.uid())
  with check (coach_id = auth.uid() or client_id = auth.uid());

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select using (coach_id = auth.uid() or client_id = auth.uid());

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
  for insert with check (
    sender_id = auth.uid()
    and (
      (coach_id = auth.uid() and sender_role = 'coach')
      or (client_id = auth.uid() and sender_role = 'client')
    )
  );

-- Update is only ever used to toggle pin state (see togglePin in
-- lib/chat-actions.ts) -- there's no message-editing feature in v1.
drop policy if exists chat_messages_update on public.chat_messages;
create policy chat_messages_update on public.chat_messages
  for update using (coach_id = auth.uid() or client_id = auth.uid())
  with check (coach_id = auth.uid() or client_id = auth.uid());

drop policy if exists chat_message_reactions_select on public.chat_message_reactions;
create policy chat_message_reactions_select on public.chat_message_reactions
  for select using (coach_id = auth.uid() or client_id = auth.uid());

drop policy if exists chat_message_reactions_insert on public.chat_message_reactions;
create policy chat_message_reactions_insert on public.chat_message_reactions
  for insert with check (
    profile_id = auth.uid() and (coach_id = auth.uid() or client_id = auth.uid())
  );

drop policy if exists chat_message_reactions_delete_own on public.chat_message_reactions;
create policy chat_message_reactions_delete_own on public.chat_message_reactions
  for delete using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime: the chat UI subscribes to postgres_changes on these two tables
-- (new messages, pin/read-state updates) instead of polling.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.chat_threads;
