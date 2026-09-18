"use server";

import { createClient } from "@/lib/supabase/server";
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

  return data as string;
}
