"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import type { AvailabilityDay } from "./booking";

// Coach-only management of their own booking link + weekly availability
// template. Both exports are safe to expose as Server Actions directly:
// neither returns a secret (booking_token is meant to be shared), and
// both are gated on the caller actually being the coach whose data
// they're touching.

// Lazily generated -- same shape as invite_links.token (randomBytes(24)
// base64url) -- the first time a coach asks for their link, rather than
// eagerly at signup via handle_new_user() like sync_code, since not
// every coach necessarily uses public booking.
export async function getOrCreateBookingLink(): Promise<string> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "coach") throw new Error("Only coaches have a booking link.");

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select("booking_token")
    .eq("id", profile.id)
    .single();
  if (readError) throw new Error(readError.message);
  if (existing?.booking_token) return existing.booking_token as string;

  const token = randomBytes(24).toString("base64url");
  const { error } = await supabase.from("profiles").update({ booking_token: token }).eq("id", profile.id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  return token;
}

// Always writes all 7 days -- the editor UI always submits the full
// week, so a plain upsert keyed on (coach_id, day_of_week) is simpler
// than diffing against what's already stored.
export async function saveAvailability(timezone: string, days: AvailabilityDay[]): Promise<void> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "coach") throw new Error("Only coaches can set availability.");

  const supabase = await createClient();
  const rows = days.map((d) => ({
    coach_id: profile.id,
    day_of_week: d.dayOfWeek,
    is_available: d.isAvailable,
    time_blocks: d.timeBlocks,
    timezone,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("coach_availability")
    .upsert(rows, { onConflict: "coach_id,day_of_week" });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/calendar");
}
