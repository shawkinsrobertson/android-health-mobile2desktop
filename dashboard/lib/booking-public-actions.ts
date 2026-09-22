"use server";

import { createClient } from "@/lib/supabase/server";
import { sendBookingEmails } from "@/lib/email";
import type { OpenSlot } from "./booking";

// No session, no getCurrentProfile() check anywhere in this file --
// these are called from the public /book/[token] page by a visitor who
// may have no account at all. Both wrap the security-definer RPCs from
// 0019_booking.sql, which do their own authorization/validation
// (get_open_slots never exposes the coach's raw weekly template or any
// event detail; create_booking re-checks the slot is still open before
// inserting).

interface OpenSlotRow {
  slot_start: string;
  slot_end: string;
}

export async function fetchOpenSlots(
  coachId: string,
  rangeStart: string, // "YYYY-MM-DD"
  rangeEnd: string,
): Promise<OpenSlot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_open_slots", {
    p_coach_id: coachId,
    p_range_start: rangeStart,
    p_range_end: rangeEnd,
  });
  if (error) throw new Error(error.message);

  return ((data ?? []) as OpenSlotRow[]).map((row) => ({
    startTime: row.slot_start,
    endTime: row.slot_end,
  }));
}

export interface BookingInput {
  coachId: string;
  startTime: string;
  endTime: string;
  bookerName: string;
  bookerEmail?: string;
  bookerPhone?: string;
  title?: string;
}

interface CreateBookingRow {
  booking_id: string;
  title: string;
  start_time: string;
  end_time: string;
  coach_name: string | null;
  coach_email: string;
  coach_timezone: string | null;
}

export async function submitBooking(input: BookingInput): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_booking", {
    p_coach_id: input.coachId,
    p_start: input.startTime,
    p_end: input.endTime,
    p_booker_name: input.bookerName,
    p_booker_email: input.bookerEmail ?? null,
    p_booker_phone: input.bookerPhone ?? null,
    p_title: input.title ?? null,
  });
  if (error) throw new Error(error.message);

  const row = (data as CreateBookingRow[])[0];

  // Best-effort -- the booking itself is already saved either way, so an
  // email-provider hiccup shouldn't fail the booking, just silently skip
  // sending it. Same posture as createEvent's "also add to Google
  // Calendar" write-out.
  try {
    await sendBookingEmails({
      bookerName: input.bookerName,
      bookerEmail: input.bookerEmail,
      coachName: row.coach_name,
      coachEmail: row.coach_email,
      coachTimezone: row.coach_timezone,
      title: row.title,
      startTime: row.start_time,
      endTime: row.end_time,
    });
  } catch {
    // See above -- not surfaced to the caller.
  }

  return row.booking_id;
}
