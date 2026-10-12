-- AI assistant Stage 1: proactive "pattern observations" surfaced on the
-- client detail page, separate from the on-demand chat in
-- ai_assistant_messages (0021). Same single-owner RLS shape as
-- ai_assistant_messages/coach_notes -- the client has zero visibility.
--
-- One row per generation (not upserted in place) so a coach can see how an
-- insight evolved over time if this is ever surfaced as a history; the UI
-- only reads the most recent row today.

create table if not exists public.ai_client_insights (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.profiles (id) on delete cascade,
  client_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists ai_client_insights_coach_client_created_idx
  on public.ai_client_insights (coach_id, client_id, created_at desc);

alter table public.ai_client_insights enable row level security;

drop policy if exists ai_client_insights_coach_all on public.ai_client_insights;
create policy ai_client_insights_coach_all on public.ai_client_insights
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());
