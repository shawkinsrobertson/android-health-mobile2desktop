// Deliberately *not* a "use server" file -- every export in one of
// those becomes a callable Server Action reachable directly from client
// code, and getValidGoogleAccessToken hands back a raw Google OAuth
// access token that must never be exposed to the browser, even in
// principle. As a plain server-only module, it can only ever be
// imported by other server-side code (Server Components, Route
// Handlers, actual "use server" action files) -- never bundled into or
// callable from the client.

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "@/lib/calendar-crypto";
import { refreshAccessToken } from "@/lib/google-calendar";

const REFRESH_MARGIN_SECONDS = 60;

export interface RawTokenRow {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  sync_token: string | null;
}

// Both the "sync my own calendar" and "coach forcing a refresh of a
// client's calendar" paths go through the exact same two RPCs
// (get_calendar_sync_token / update_calendar_sync_state,
// 0017_calendar_connections.sql) rather than having a separate
// plain-RLS code path for the self case -- the RPC's own authorization
// check already allows `p_profile_id = auth.uid()` trivially, so
// there's no reason to maintain two different ways of reading/writing
// this state.
async function getRawConnection(supabase: SupabaseClient, profileId: string): Promise<RawTokenRow | null> {
  const { data, error } = await supabase.rpc("get_calendar_sync_token", { p_profile_id: profileId });
  if (error) throw new Error(error.message);
  return (data?.[0] as RawTokenRow | undefined) ?? null;
}

// Returns a currently-valid access token, refreshing (and persisting
// the refresh via update_calendar_sync_state) first if needed. Callable
// for the token owner's own profileId or, via the same RPC's
// authorization check, their coach acting on their behalf.
export async function getValidGoogleAccessToken(
  supabase: SupabaseClient,
  profileId: string,
): Promise<{ accessToken: string; row: RawTokenRow } | null> {
  const row = await getRawConnection(supabase, profileId);
  if (!row) return null;

  const expiresAt = new Date(row.expires_at);
  if (expiresAt.getTime() - Date.now() > REFRESH_MARGIN_SECONDS * 1000) {
    return { accessToken: decryptToken(row.access_token), row };
  }

  const refreshed = await refreshAccessToken(decryptToken(row.refresh_token));
  await supabase.rpc("update_calendar_sync_state", {
    p_profile_id: profileId,
    p_sync_token: row.sync_token,
    p_last_synced_at: null,
    p_access_token: encryptToken(refreshed.accessToken),
    p_refresh_token: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : null,
    p_expires_at: refreshed.expiresAt.toISOString(),
  });

  return { accessToken: refreshed.accessToken, row };
}
