-- Booking confirmation emails. create_booking (0019_booking.sql) only ever
-- returned the new row's id -- everything a confirmation email needs
-- (the coach's name/email, and their timezone so the email shows a time
-- that actually matches what the booker picked, not the server's UTC
-- default) has to come from somewhere. Rather than a second round-trip
-- from lib/booking-public-actions.ts (another anon-callable RPC, another
-- narrow-exposure surface to reason about), this just widens what the
-- same, already-audited function returns: it's running security definer
-- either way, so reading the coach's profiles.email here is no different
-- in kind from what it already does by inserting into calendar_events on
-- their behalf.
--
-- The return type changes shape (uuid -> a row), which create or replace
-- can't do in place -- drop first, matching Postgres's own requirement,
-- not a departure from this project's "never edit a shipped migration"
-- rule (0019 itself is untouched; this just replaces the function it
-- defined, the same way 0018 replaced 0016's insert policy).

drop function if exists public.create_booking(uuid, timestamptz, timestamptz, text, text, text, text);

create function public.create_booking(
  p_coach_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_booker_name text,
  p_booker_email text,
  p_booker_phone text,
  p_title text
)
returns table (
  booking_id uuid,
  title text,
  start_time timestamptz,
  end_time timestamptz,
  coach_name text,
  coach_email text,
  coach_timezone text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_title text;
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

  v_title := coalesce(nullif(trim(p_title), ''), 'Booked appointment');

  insert into public.calendar_events (
    coach_id, client_id, created_by,
    booker_name, booker_email, booker_phone,
    title, start_time, end_time
  ) values (
    p_coach_id, null, null,
    p_booker_name, p_booker_email, p_booker_phone,
    v_title, p_start, p_end
  )
  returning id into v_id;

  return query
    select
      v_id,
      v_title,
      p_start,
      p_end,
      p.full_name,
      p.email,
      -- Coaches set one timezone per weekly-template day today (there's
      -- no single "my timezone" field on profiles) -- any one row is a
      -- fine stand-in, since a coach splitting their week across
      -- timezones isn't a real case this needs to handle.
      (select ca.timezone from public.coach_availability ca where ca.coach_id = p_coach_id limit 1)
    from public.profiles p
    where p.id = p_coach_id;
end;
$$;

grant execute on function public.create_booking(uuid, timestamptz, timestamptz, text, text, text, text) to anon, authenticated;
