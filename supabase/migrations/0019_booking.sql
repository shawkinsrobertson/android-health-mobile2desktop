-- Shared coach-client calendar, pass 3: native booking. A coach's
-- booking link goes to *anyone* they want to book time with, not just an
-- existing client (see 0016_calendar_events.sql's own comment on
-- client_id/created_by) -- so the visitor may have no account and no
-- session at all, the same posture as /join/[token]'s anonymous invite
-- flow. That means the actual read (open slots) and write (create the
-- booking) can't go through ordinary table RLS the way an interactive
-- coach/client request does -- there's no auth.uid() to check. This uses
-- the same two precedents 0002_accounts.sql already established for
-- exactly this situation -- a narrow public view (invite_status) and a
-- security-definer function crossing the RLS boundary in a controlled
-- way (handle_new_user) -- as, respectively, booking_profile and the
-- get_open_slots/create_booking RPC pair below.

-- ---------------------------------------------------------------------------
-- booking_token -- an unguessable capability, same shape as
-- invite_links.token, but lazily generated (lib/booking-actions.ts's
-- getOrCreateBookingLink) rather than always present, since not every
-- coach necessarily uses public booking.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists booking_token text unique;

-- Narrow, public-safe view for the /book/[token] page to resolve a token
-- to a coach before the visitor has any account -- exposes only what's
-- needed to render the booking screen, never the full profiles row.
create or replace view public.booking_profile as
select id as coach_id, full_name, booking_token
  from public.profiles
 where booking_token is not null;

grant select on public.booking_profile to anon, authenticated;

-- ---------------------------------------------------------------------------
-- coach_availability -- the weekly template. One row per (coach,
-- day_of_week); toggling a day off sets is_available = false without
-- touching time_blocks, so re-enabling restores the same hours. A
-- one-off exception (a single vacation day) is just an ordinary
-- calendar_events block on that date -- get_open_slots already has to
-- check existing events for conflicts, so it doesn't need a separate
-- "override" concept.
-- ---------------------------------------------------------------------------
create table if not exists public.coach_availability (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references public.profiles (id) on delete cascade,
  day_of_week   smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday
  is_available  boolean not null default true,
  -- [{"start":"09:00","end":"12:00"}, ...] in the coach's own local time
  -- (timezone below) -- a list, not a single range, so a split day (e.g.
  -- morning + evening) doesn't need a second row.
  time_blocks   jsonb not null default '[]',
  timezone      text not null,
  updated_at    timestamptz not null default now(),
  unique (coach_id, day_of_week)
);

alter table public.coach_availability enable row level security;

drop policy if exists coach_availability_owner_all on public.coach_availability;
create policy coach_availability_owner_all on public.coach_availability
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- ---------------------------------------------------------------------------
-- get_open_slots -- security definer, callable by anon. Expands the
-- coach's weekly template into concrete slots across the given date
-- range (their own stored timezone), subtracting any existing
-- calendar_events in that window (covers real bookings *and* an ad-hoc
-- vacation block placed directly on the calendar) and anything already
-- in the past. Never returns the coach's raw weekly-template rows or any
-- event detail -- just plain open (slot_start, slot_end) pairs.
-- ---------------------------------------------------------------------------
create or replace function public.get_open_slots(
  p_coach_id uuid,
  p_range_start date,
  p_range_end date,
  p_slot_minutes integer default 30
)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date;
  v_dow smallint;
  v_avail record;
  v_block jsonb;
  v_block_start time;
  v_block_end time;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
begin
  if p_range_end < p_range_start or p_range_end > p_range_start + 60 then
    raise exception 'invalid range';
  end if;
  if p_slot_minutes < 5 or p_slot_minutes > 480 then
    raise exception 'invalid slot length';
  end if;

  for v_day in select generate_series(p_range_start, p_range_end, interval '1 day')::date loop
    v_dow := extract(dow from v_day);

    select * into v_avail
      from public.coach_availability
     where coach_availability.coach_id = p_coach_id
       and day_of_week = v_dow;

    if v_avail is null or not v_avail.is_available then
      continue;
    end if;

    for v_block in select * from jsonb_array_elements(v_avail.time_blocks) loop
      v_block_start := (v_block ->> 'start')::time;
      v_block_end := (v_block ->> 'end')::time;

      v_day_start := (v_day::text || ' ' || v_block_start::text)::timestamp at time zone v_avail.timezone;
      v_day_end := (v_day::text || ' ' || v_block_end::text)::timestamp at time zone v_avail.timezone;

      v_slot_start := v_day_start;
      while v_slot_start + (p_slot_minutes || ' minutes')::interval <= v_day_end loop
        v_slot_end := v_slot_start + (p_slot_minutes || ' minutes')::interval;

        if v_slot_start > now() and not exists (
          select 1 from public.calendar_events ce
           where ce.coach_id = p_coach_id
             and ce.start_time < v_slot_end
             and ce.end_time > v_slot_start
        ) then
          slot_start := v_slot_start;
          slot_end := v_slot_end;
          return next;
        end if;

        v_slot_start := v_slot_end;
      end loop;
    end loop;
  end loop;
end;
$$;

grant execute on function public.get_open_slots(uuid, date, date, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_booking -- security definer, callable by anon. Re-validates the
-- slot is still open (race protection against two visitors booking the
-- same slot) before inserting, then writes a calendar_events row with
-- client_id/created_by left null and the booker's contact info populated
-- instead -- same shape 0016_calendar_events.sql already reserved for
-- this. If the booker's email happens to match an existing client of
-- that coach, linking the event to that client_id after the fact is a
-- nice-to-have follow-up, not required for v1.
-- ---------------------------------------------------------------------------
create or replace function public.create_booking(
  p_coach_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_booker_name text,
  p_booker_email text,
  p_booker_phone text,
  p_title text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_start >= p_end or p_start < now() then
    raise exception 'invalid time range';
  end if;
  if p_booker_name is null or length(trim(p_booker_name)) = 0 then
    raise exception 'booker name is required';
  end if;

  if exists (
    select 1 from public.calendar_events ce
     where ce.coach_id = p_coach_id
       and ce.start_time < p_end
       and ce.end_time > p_start
  ) then
    raise exception 'slot no longer available';
  end if;

  insert into public.calendar_events (
    coach_id, client_id, created_by,
    booker_name, booker_email, booker_phone,
    title, start_time, end_time
  ) values (
    p_coach_id, null, null,
    p_booker_name, p_booker_email, p_booker_phone,
    coalesce(nullif(trim(p_title), ''), 'Booked appointment'), p_start, p_end
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_booking(uuid, timestamptz, timestamptz, text, text, text, text) to anon, authenticated;
