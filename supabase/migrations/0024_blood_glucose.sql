-- Blood glucose: the ninth Health Connect record type synced by this
-- app. Was listed only as a future type in PLANNING.md's Phase 6 section
-- (the "Your Top 3" mockup stat cards reference an "Avg. BG" stat this
-- app had nothing behind) -- this closes that gap.
--
-- Created directly in the *current* (post-0022) shape every other
-- health-data table ended up in, rather than replaying the
-- anon-RLS -> per-client-RLS -> composite-unique-key history those
-- tables went through: `client_id` is `not null` from the start (no
-- legacy anon-role rows to backfill), and `health_connect_id` is unique
-- per-client, not globally, matching 0022's reasoning (a reused device's
-- Health Connect history re-synced under a different account must not
-- collide with the first account's rows).

create table if not exists public.blood_glucose (
  id                    uuid primary key default gen_random_uuid(),
  health_connect_id     text not null,
  client_id             uuid not null references public.profiles (id) on delete cascade,
  sample_time           timestamptz not null,
  level_mg_dl           numeric not null,
  specimen_source_code  integer,
  meal_type_code        integer,
  relation_to_meal_code integer,
  source_package        text,
  synced_at             timestamptz not null default now(),
  unique (client_id, health_connect_id)
);
create index if not exists blood_glucose_sample_time_idx on public.blood_glucose (sample_time);
create index if not exists blood_glucose_client_id_idx on public.blood_glucose (client_id);

alter table public.blood_glucose enable row level security;

-- Same dual-ownership pattern as every other health-data table (see
-- 0015_health_data_auth.sql): client owns their own rows outright, their
-- coach gets read-only access via the client_profiles.coach_id lookup.
drop policy if exists blood_glucose_client_all on public.blood_glucose;
create policy blood_glucose_client_all on public.blood_glucose
  for all using (client_id = auth.uid()) with check (client_id = auth.uid());

drop policy if exists blood_glucose_coach_select on public.blood_glucose;
create policy blood_glucose_coach_select on public.blood_glucose
  for select using (client_id in (select profile_id from public.client_profiles where coach_id = auth.uid()));

-- Add the new type to the data-sharing consent taxonomy
-- (0014_client_data_consent.sql) -- defaults to shared (consented=true)
-- the same way every existing row-less type already effectively does.
alter table public.client_data_consent drop constraint if exists client_data_consent_data_type_check;
alter table public.client_data_consent add constraint client_data_consent_data_type_check check (
  data_type in (
    'steps',
    'heart_rate_samples',
    'sleep_sessions',
    'exercise_sessions',
    'blood_oxygen',
    'blood_pressure',
    'respiratory_rate',
    'blood_glucose'
  )
);
