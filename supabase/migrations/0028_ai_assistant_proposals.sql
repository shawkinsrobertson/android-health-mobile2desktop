-- AI assistant Stage 2: the generic "coach reviews before execution" gate
-- for every write-capable assistant outcome that has no natural staging
-- home of its own. Draft workouts/documents (Stage 4/5) do NOT use this
-- table -- they stage directly on library_workouts/library_documents via
-- a status column, so a draft shows up right in the coach's existing
-- Workouts/Documents list instead of a separate queue. This table is for
-- draft chat messages, training-plan change proposals, and call-scheduling
-- proposals (Stage 3/6/7) -- outcomes with no existing list to stage
-- inside of.
--
-- A write-capable assistant tool never mutates live data directly: it
-- inserts a 'pending' row here and returns its id to the model. A coach
-- action later either rejects it (status -> 'rejected', nothing else
-- happens) or runs the type-specific apply logic and marks it 'applied'.
-- This is enforced by the application, not the database -- RLS here only
-- enforces per-coach ownership, same single-owner shape as every other
-- AI-assistant table (ai_assistant_messages, ai_client_insights).

create table if not exists public.ai_assistant_proposals (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.profiles (id) on delete cascade,
  client_id    uuid not null references public.profiles (id) on delete cascade,
  type         text not null check (type in ('draft_message', 'program_change', 'schedule_call')),
  summary      text not null,
  payload      jsonb not null,
  status       text not null default 'pending' check (status in ('pending', 'rejected', 'applied')),
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);
create index if not exists ai_assistant_proposals_coach_client_status_idx
  on public.ai_assistant_proposals (coach_id, client_id, status, created_at desc);

alter table public.ai_assistant_proposals enable row level security;

drop policy if exists ai_assistant_proposals_coach_all on public.ai_assistant_proposals;
create policy ai_assistant_proposals_coach_all on public.ai_assistant_proposals
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());
