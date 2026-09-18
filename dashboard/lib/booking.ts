import type { SupabaseClient } from "@supabase/supabase-js";

export interface TimeBlock {
  start: string; // "HH:mm", local to `timezone` below
  end: string;
}

export interface AvailabilityDay {
  dayOfWeek: number; // 0-6, 0 = Sunday, matches coach_availability.day_of_week
  isAvailable: boolean;
  timeBlocks: TimeBlock[];
}

export interface CoachAvailability {
  timezone: string;
  days: AvailabilityDay[]; // always all 7 days, defaults filled in for any day with no row yet
}

const DAY_COUNT = 7;

interface AvailabilityRow {
  day_of_week: number;
  is_available: boolean;
  time_blocks: TimeBlock[];
  timezone: string;
}

// A day with no row at all defaults to unavailable, not available -- a
// coach who hasn't configured their schedule yet shouldn't be bookable
// by default.
export async function getCoachAvailability(supabase: SupabaseClient, coachId: string): Promise<CoachAvailability> {
  const { data, error } = await supabase
    .from("coach_availability")
    .select("day_of_week, is_available, time_blocks, timezone")
    .eq("coach_id", coachId);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as AvailabilityRow[];
  const byDay = new Map(rows.map((r) => [r.day_of_week, r]));
  const timezone = rows[0]?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const days: AvailabilityDay[] = Array.from({ length: DAY_COUNT }, (_, dayOfWeek) => {
    const row = byDay.get(dayOfWeek);
    return {
      dayOfWeek,
      isAvailable: row?.is_available ?? false,
      timeBlocks: row?.time_blocks ?? [],
    };
  });

  return { timezone, days };
}

export interface OpenSlot {
  startTime: string;
  endTime: string;
}

export interface BookingCoach {
  coachId: string;
  fullName: string | null;
}

// Public-safe lookup via the booking_profile view (0019_booking.sql) --
// works for an anonymous visitor since it's just filtering a view
// PostgREST already grants anon select on, same shape as
// /join/[token]'s invite_status lookup.
export async function getCoachByBookingToken(
  supabase: SupabaseClient,
  token: string,
): Promise<BookingCoach | null> {
  const { data } = await supabase
    .from("booking_profile")
    .select("coach_id, full_name")
    .eq("booking_token", token)
    .single();

  if (!data) return null;
  return { coachId: data.coach_id, fullName: data.full_name };
}
