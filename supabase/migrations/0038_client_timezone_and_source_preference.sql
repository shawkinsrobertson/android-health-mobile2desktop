-- Steps-data accuracy, pass 1: schema.
--
-- Two additions, investigated and agreed with the user after the steps
-- chart kept showing numbers that didn't match the client's wearable:
--
-- 1. client_profiles.timezone -- there was previously NO way for the
--    server (web dashboard, Postgres) to know what timezone a client is
--    actually in. The dashboard's day-by-day bucketing (lib/queries.ts)
--    fell back to UTC calendar days; Android's on-device Stats screen
--    uses the device's real local timezone (ZoneId.systemDefault()) --
--    for any client not in UTC, the exact same data lands on different
--    calendar days depending on which surface you look at. Populated by
--    Android on every sync (see SyncRepository.kt), same "device reports
--    its own setting" pattern client_profiles.preferred_weight_unit
--    already uses, just written from Android instead of read there.
--
-- 2. client_metric_source_preference -- lets a client pick an explicit
--    data source (e.g. "use my Garmin, not my phone's own sensor") per
--    metric type, instead of relying on the dashboard's resolveOverlap-
--    pingSources heuristic ("guess which source is primary by daily
--    total") to avoid double-counting when Health Connect has more than
--    one app writing the same kind of record -- Health Connect itself
--    does not dedupe across source apps (confirmed from raw synced rows,
--    see that function's own comment). One row per (client, metric_type)
--    they've overridden; no row means "no preference, use the default
--    heuristic/merge-everything behavior." Same per-(client,type) row
--    shape as client_data_consent, for the same reason -- a client might
--    want Garmin for steps but their phone for heart rate.

alter table public.client_profiles
  add column if not exists timezone text;

create table if not exists public.client_metric_source_preference (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.profiles (id) on delete cascade,
  metric_type    text not null,
  source_package text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (client_id, metric_type)
);
create index if not exists client_metric_source_preference_client_id_idx
  on public.client_metric_source_preference (client_id);

alter table public.client_metric_source_preference enable row level security;

drop policy if exists client_metric_source_preference_client_all on public.client_metric_source_preference;
create policy client_metric_source_preference_client_all on public.client_metric_source_preference
  for all using (client_id = auth.uid()) with check (client_id = auth.uid());

drop policy if exists client_metric_source_preference_coach_select on public.client_metric_source_preference;
create policy client_metric_source_preference_coach_select on public.client_metric_source_preference
  for select using (client_id in (select profile_id from public.client_profiles where coach_id = auth.uid()));
