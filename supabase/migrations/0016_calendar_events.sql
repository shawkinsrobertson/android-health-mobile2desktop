-- Shared coach-client calendar, pass 1: native events only (no external
-- calendar sync yet -- that's calendar_connections in a later pass, see
-- PLANNING.md's calendar section).
--
-- client_id is nullable and there's no dual "created_by must be coach or
-- client" constraint the way chat_calls has, because a later pass adds a
-- public booking link the coach can send to *anyone* -- not just an
-- existing client -- so a booked appointment can have no client
-- relationship at all, just contact info (booker_name/email/phone).
-- created_by is nullable for the same reason: that public booking flow
-- has no session, hence no auth.uid() to record.
--
-- RLS follows the same dual-ownership pattern as chat_calls
-- (0012_chat_calls.sql) since both coach and client need full read
-- access here -- unlike coach_notes, which is coach-only.
--
-- No is_private/is_shared flag on this table: the privacy line this
-- feature needs is "AI assistant vs. human," not "some events vs.
-- others" -- every event's title/description/location stays human-only,
-- unconditionally, enforced by which query a caller uses
-- (lib/calendar.ts's getBusyBlocks vs. listEvents), not by a column here.

create table if not exists public.calendar_events (
  id                      uuid primary key default gen_random_uuid(),
  coach_id                uuid not null references public.profiles (id) on delete cascade,
  client_id               uuid references public.profiles (id) on delete cascade,
  created_by              uuid references public.profiles (id) on delete cascade,
  booker_name             text,
  booker_email            text,
  booker_phone            text,
  title                   text not null,
  description             text,
  location                text,
  start_time              timestamptz not null,
  end_time                timestamptz not null,
  all_day                 boolean not null default false,
  reminder_minutes_before integer,
  -- has_video_call is set at creation (the modal's checkbox); the room
  -- itself is minted lazily on first "Join" click, not at creation time
  -- -- see joinCalendarEvent in calendar-actions.ts for why (a Daily.co
  -- room's expiry has to be anchored to the event's own end_time, not
  -- to whenever the event happened to be created).
  has_video_call          boolean not null default false,
  video_call_room_name    text,
  video_call_room_url     text,
  external_source         text check (external_source in ('google')),
  external_calendar_id    text,
  external_event_id       text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint calendar_events_time_order check (end_time > start_time),
  unique (external_source, external_calendar_id, external_event_id)
);
create index if not exists calendar_events_coach_id_idx on public.calendar_events (coach_id, start_time);
create index if not exists calendar_events_client_id_idx on public.calendar_events (client_id);

alter table public.calendar_events enable row level security;

drop policy if exists calendar_events_select on public.calendar_events;
create policy calendar_events_select on public.calendar_events
  for select using (coach_id = auth.uid() or client_id = auth.uid());

-- Interactive inserts (the "new event" modal) only -- the later public
-- booking-page flow goes through a security-definer RPC instead, since
-- that caller has no auth.uid() at all. See PLANNING.md.
drop policy if exists calendar_events_insert on public.calendar_events;
create policy calendar_events_insert on public.calendar_events
  for insert with check (
    created_by = auth.uid()
    and (coach_id = auth.uid() or client_id = auth.uid())
  );

drop policy if exists calendar_events_update on public.calendar_events;
create policy calendar_events_update on public.calendar_events
  for update using (coach_id = auth.uid() or client_id = auth.uid())
  with check (coach_id = auth.uid() or client_id = auth.uid());

drop policy if exists calendar_events_delete on public.calendar_events;
create policy calendar_events_delete on public.calendar_events
  for delete using (coach_id = auth.uid() or client_id = auth.uid());

alter publication supabase_realtime add table public.calendar_events;
