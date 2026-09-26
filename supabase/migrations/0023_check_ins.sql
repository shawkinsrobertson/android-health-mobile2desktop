-- Weekly check-ins (2026 UI pass): the "Tasks" panel in the redesigned
-- client home screen ("Tell me how it was! Fill out your weekly
-- check-in") needs a real feature behind it, not a mock. This reuses the
-- document library's dynamic form builder shape (form_schema jsonb -- see
-- dashboard/lib/forms.ts's FormField/FormSchema types and
-- 0004_libraries.sql's library_documents) rather than inventing a second
-- question-authoring format, since a weekly check-in is exactly "a form,
-- but assigned recurringly instead of once."
--
-- Two tables, mirroring assigned_documents/document_responses
-- (0005_assigned.sql) with one structural difference: assigned_documents
-- is a one-shot assignment with a single document_responses row per
-- assignment (unique(assigned_document_id)). A check-in template is
-- assigned once but answered every week, so the response table is keyed
-- on (template_id, week_start) instead.

create table if not exists public.check_in_templates (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.profiles (id) on delete cascade,
  client_id    uuid not null references public.profiles (id) on delete cascade,
  name         text not null default 'Weekly Check-In',
  form_schema  jsonb not null,
  -- 0 = Sunday .. 6 = Saturday, ISO-ish but Sunday-first to match
  -- date_trunc('week', ...) + this offset in lib/check-ins.ts's own
  -- week-bucketing helper -- the day a new week's check-in opens up and
  -- the day the *previous* week's response is considered due.
  day_of_week  smallint not null default 0 check (day_of_week between 0 and 6),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- One active recurring check-in per client at a time keeps "what's due
  -- this week" unambiguous for the home screen's Tasks panel -- a coach
  -- who wants to change the questions edits this row rather than layering
  -- a second one on top.
  unique (coach_id, client_id)
);
create index if not exists check_in_templates_client_id_idx on public.check_in_templates (client_id);

create table if not exists public.check_in_responses (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.check_in_templates (id) on delete cascade,
  client_id    uuid not null references public.profiles (id) on delete cascade,
  coach_id     uuid not null references public.profiles (id) on delete cascade,
  -- The Sunday (or template's day_of_week) that opens the week this
  -- response answers -- lets a client fill in a skipped week late without
  -- colliding with the current week's row.
  week_start   date not null,
  answers      jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (template_id, week_start)
);
create index if not exists check_in_responses_client_id_idx on public.check_in_responses (client_id);
create index if not exists check_in_responses_coach_id_idx on public.check_in_responses (coach_id);

alter table public.check_in_templates enable row level security;
alter table public.check_in_responses enable row level security;

drop policy if exists check_in_templates_coach_all on public.check_in_templates;
create policy check_in_templates_coach_all on public.check_in_templates
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- Read-only for the client: they answer the questions, they don't edit
-- them (same "own their answers, not the template" split as
-- assigned_documents/document_responses).
drop policy if exists check_in_templates_client_select on public.check_in_templates;
create policy check_in_templates_client_select on public.check_in_templates
  for select using (client_id = auth.uid());

drop policy if exists check_in_responses_select_own on public.check_in_responses;
create policy check_in_responses_select_own on public.check_in_responses
  for select using (client_id = auth.uid());
drop policy if exists check_in_responses_insert_own on public.check_in_responses;
create policy check_in_responses_insert_own on public.check_in_responses
  for insert with check (client_id = auth.uid());
drop policy if exists check_in_responses_update_own on public.check_in_responses;
create policy check_in_responses_update_own on public.check_in_responses
  for update using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists check_in_responses_coach_select on public.check_in_responses;
create policy check_in_responses_coach_select on public.check_in_responses
  for select using (coach_id = auth.uid());
