-- Video/audio calling (chat v2): a call is its own row per attempt, not a
-- persistent thing on chat_threads -- ringing/accepted/declined/ended is a
-- small state machine, and each call gets a fresh Daily.co room rather than
-- reusing one across a thread's lifetime (avoids any "is someone still in
-- the old room" ambiguity). 1:1 only, matching the thread model chat
-- already uses -- no group calls.
--
-- RLS follows the same dual-ownership pattern as chat_threads/chat_messages
-- (0011_chat.sql): coach_id/client_id denormalized so every policy is a
-- flat auth.uid() check, both participants get full select.

create table if not exists public.chat_calls (
  id               uuid primary key default gen_random_uuid(),
  thread_id        uuid not null references public.chat_threads (id) on delete cascade,
  coach_id         uuid not null references public.profiles (id) on delete cascade,
  client_id        uuid not null references public.profiles (id) on delete cascade,
  initiated_by     uuid not null references public.profiles (id) on delete cascade,
  daily_room_name  text not null,
  daily_room_url   text not null,
  status           text not null default 'ringing' check (status in ('ringing', 'accepted', 'declined', 'ended')),
  started_at       timestamptz,
  ended_at         timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists chat_calls_thread_id_created_at_idx on public.chat_calls (thread_id, created_at);
create index if not exists chat_calls_coach_id_idx on public.chat_calls (coach_id);
create index if not exists chat_calls_client_id_idx on public.chat_calls (client_id);

alter table public.chat_calls enable row level security;

drop policy if exists chat_calls_select on public.chat_calls;
create policy chat_calls_select on public.chat_calls
  for select using (coach_id = auth.uid() or client_id = auth.uid());

drop policy if exists chat_calls_insert on public.chat_calls;
create policy chat_calls_insert on public.chat_calls
  for insert with check (
    initiated_by = auth.uid()
    and (coach_id = auth.uid() or client_id = auth.uid())
  );

-- Update is only ever a status transition (ringing -> accepted/declined/
-- ended) by either participant -- no message-style editing here.
drop policy if exists chat_calls_update on public.chat_calls;
create policy chat_calls_update on public.chat_calls
  for update using (coach_id = auth.uid() or client_id = auth.uid())
  with check (coach_id = auth.uid() or client_id = auth.uid());

alter publication supabase_realtime add table public.chat_calls;
