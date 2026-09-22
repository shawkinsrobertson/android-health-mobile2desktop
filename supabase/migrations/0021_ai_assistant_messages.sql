-- Per-client AI assistant, Phase 5: persisted chat history. Coach-only --
-- the client (person being coached) has zero visibility into this table,
-- same single-owner shape as coach_notes, and deliberately separate from
-- chat_threads/chat_messages (0011_chat.sql), which is human coach<->
-- client messaging. See PLANNING.md's Phase 5 section for the full design.
--
-- Rows store only the flattened final role/content text of each turn --
-- not Claude's intermediate tool_use/tool_result content blocks. Each new
-- question re-runs tool-calling fresh against live data; prior turns are
-- replayed to the model as plain text context only. This keeps the
-- persisted history human-readable and avoids needing to serialize
-- Anthropic's block-structured message format into Postgres.

create table if not exists public.ai_assistant_messages (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.profiles (id) on delete cascade,
  client_id   uuid not null references public.profiles (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists ai_assistant_messages_coach_client_created_idx
  on public.ai_assistant_messages (coach_id, client_id, created_at);

alter table public.ai_assistant_messages enable row level security;

drop policy if exists ai_assistant_messages_coach_all on public.ai_assistant_messages;
create policy ai_assistant_messages_coach_all on public.ai_assistant_messages
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());
