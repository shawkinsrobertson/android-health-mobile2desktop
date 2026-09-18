"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getClientProfile } from "@/lib/profile";
import { getValidGoogleAccessToken } from "@/lib/calendar-connections";
import { listCalendars, listGoogleEvents } from "@/lib/google-calendar";

// Who a synced-in event should be attributed to on our side, for
// whichever profile's calendar this sync run covers.
async function resolveEventOwnership(
  supabase: SupabaseClient,
  callerId: string,
  callerRole: "coach" | "client",
  targetProfileId: string,
): Promise<{ coachId: string; clientId: string | null }> {
  if (callerId === targetProfileId) {
    if (callerRole === "coach") return { coachId: callerId, clientId: null };
    const clientProfile = await getClientProfile(callerId, supabase);
    if (!clientProfile?.coachId) throw new Error("No coach assigned yet.");
    return { coachId: clientProfile.coachId, clientId: callerId };
  }
  // Coach syncing a specific client's calendar on their behalf.
  return { coachId: callerId, clientId: targetProfileId };
}

const SYNC_WINDOW_DAYS = 30;

// Covers both "sync my own calendar" (profileId === caller) and a
// coach forcing a refresh of one specific client's calendar
// (profileId === that client) -- see getValidGoogleAccessToken's own
// authorization check for why the latter is allowed at all.
export async function syncGoogleCalendar(profileId: string): Promise<{ syncedCount: number }> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in.");

  const supabase = await createClient();
  const connection = await getValidGoogleAccessToken(supabase, profileId);
  if (!connection) throw new Error("No Google Calendar connected for this person.");

  const { coachId, clientId } = await resolveEventOwnership(supabase, profile.id, profile.role, profileId);

  const calendars = await listCalendars(connection.accessToken);
  const primary = calendars.find((c) => c.primary) ?? calendars[0];
  if (!primary) return { syncedCount: 0 };

  const timeMin = new Date(Date.now() - SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let page = await listGoogleEvents(connection.accessToken, primary.id, {
    syncToken: connection.row.sync_token ?? undefined,
    timeMin: connection.row.sync_token ? undefined : timeMin,
  });

  // A 410 means the syncToken itself expired (not our access token) --
  // fall back to a fresh full sync, same shape as the Android app's
  // Health Connect changes-token/backfill fallback.
  if (page.syncTokenExpired) {
    page = await listGoogleEvents(connection.accessToken, primary.id, { timeMin });
  }

  let syncedCount = 0;
  for (const event of page.events) {
    if (event.cancelled) {
      await supabase
        .from("calendar_events")
        .delete()
        .eq("external_source", "google")
        .eq("external_calendar_id", primary.id)
        .eq("external_event_id", event.id);
      continue;
    }

    const { error } = await supabase.from("calendar_events").upsert(
      {
        coach_id: coachId,
        client_id: clientId,
        title: event.summary || "(untitled)",
        description: event.description,
        location: event.location,
        start_time: event.startTime,
        end_time: event.endTime,
        all_day: event.allDay,
        external_source: "google",
        external_calendar_id: primary.id,
        external_event_id: event.id,
      },
      { onConflict: "external_source,external_calendar_id,external_event_id" },
    );
    if (!error) syncedCount += 1;
  }

  await supabase.rpc("update_calendar_sync_state", {
    p_profile_id: profileId,
    p_sync_token: page.nextSyncToken,
    p_last_synced_at: new Date().toISOString(),
  });

  revalidatePath("/dashboard");
  revalidatePath("/client");
  if (clientId) revalidatePath(`/dashboard/clients/${clientId}`);

  return { syncedCount };
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("calendar_connections")
    .delete()
    .eq("profile_id", profile.id)
    .eq("provider", "google");

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/client");
}
