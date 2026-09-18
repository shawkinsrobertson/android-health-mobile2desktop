// Server-only Google Calendar + OAuth client -- plain fetch calls, no
// SDK, same approach lib/daily.ts already takes for Daily.co and for
// the same reason: this app only needs a handful of well-defined calls
// (build the consent URL, exchange/refresh tokens, list calendars,
// incrementally sync events, insert one) so a dependency-free client is
// simpler than pulling in Google's API client library for that.

const OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

// calendar.events: read + write, needed because the "new event" modal
// can write an in-app-created event *into* a connected calendar, not
// just read from one. calendar.readonly: enumerating calendarList so
// the user can pick which calendars to sync. userinfo.email: just to
// label the connection with the connected account's address in the UI.
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

function clientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_CLIENT_ID is not set.");
  return id;
}

function clientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET is not set.");
  return secret;
}

function redirectUri(): string {
  const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
  return `${siteUrl}/api/calendar/google/callback`;
}

// `state` carries whatever the callback needs to know who's connecting
// and where to send them back to -- see app/api/calendar/google/start/route.ts.
export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent", // guarantees a refresh_token even on a re-connect
    state,
  });
  return `${OAUTH_BASE}?${params.toString()}`;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null; // null on a refresh response that didn't reissue one
  expiresAt: Date;
  scope: string;
}

async function tokenRequest(body: URLSearchParams): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google token request failed (${res.status}): ${text || res.statusText}`);
  }
  const data = await res.json();
  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string | undefined) ?? null,
    expiresAt: new Date(Date.now() + Number(data.expires_in) * 1000),
    scope: (data.scope as string | undefined) ?? SCOPES,
  };
}

export function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  return tokenRequest(
    new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      code,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  );
}

// Google doesn't rotate the refresh token on every use the way
// Supabase's own auth does -- the response usually omits refresh_token
// entirely, meaning "keep using the one you already have." Only
// overwrite the stored refresh token when a new one actually comes back.
export function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  return tokenRequest(
    new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  );
}

async function calendarFetch(accessToken: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${CALENDAR_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  return res;
}

export async function getConnectedAccountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.email as string | undefined) ?? null;
}

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  primary: boolean;
}

export async function listCalendars(accessToken: string): Promise<GoogleCalendarListEntry[]> {
  const res = await calendarFetch(accessToken, "/users/me/calendarList?minAccessRole=writer");
  if (!res.ok) throw new Error(`Failed to list Google calendars (${res.status})`);
  const data = await res.json();
  return ((data.items as unknown[]) ?? []).map((item) => {
    const i = item as { id: string; summary: string; primary?: boolean };
    return { id: i.id, summary: i.summary, primary: i.primary ?? false };
  });
}

export interface GoogleEvent {
  id: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  startTime: string; // always normalized to an ISO instant, even for an all-day date
  endTime: string;
  allDay: boolean;
  cancelled: boolean;
}

function parseGoogleEventTime(time: { date?: string; dateTime?: string }): { iso: string; allDay: boolean } {
  if (time.dateTime) return { iso: time.dateTime, allDay: false };
  // All-day events only carry a bare date -- anchor to midnight UTC of
  // that date rather than guessing a timezone.
  return { iso: new Date(`${time.date}T00:00:00Z`).toISOString(), allDay: true };
}

export interface SyncPage {
  events: GoogleEvent[];
  nextSyncToken: string | null;
  /** true means the syncToken was rejected (410) -- caller must fall back to a full resync with no syncToken. */
  syncTokenExpired: boolean;
}

// Incremental sync via Google's syncToken (see PLANNING.md's Phase 7
// section) -- omit syncToken for a first-time/full sync, seeded by
// timeMin instead so a fresh connection doesn't pull someone's entire
// calendar history.
export async function listGoogleEvents(
  accessToken: string,
  calendarId: string,
  options: { syncToken?: string; timeMin?: string },
): Promise<SyncPage> {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  while (true) {
    const params = new URLSearchParams({ maxResults: "250", singleEvents: "true" });
    if (options.syncToken) params.set("syncToken", options.syncToken);
    else if (options.timeMin) params.set("timeMin", options.timeMin);
    if (pageToken) params.set("pageToken", pageToken);

    const res = await calendarFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);

    if (res.status === 410) {
      return { events: [], nextSyncToken: null, syncTokenExpired: true };
    }
    if (!res.ok) {
      throw new Error(`Failed to list Google Calendar events (${res.status})`);
    }

    const data = await res.json();
    for (const raw of (data.items as unknown[]) ?? []) {
      const item = raw as {
        id: string;
        status: string;
        summary?: string;
        description?: string;
        location?: string;
        start: { date?: string; dateTime?: string };
        end: { date?: string; dateTime?: string };
      };
      const start = parseGoogleEventTime(item.start);
      const end = parseGoogleEventTime(item.end);
      events.push({
        id: item.id,
        summary: item.summary ?? null,
        description: item.description ?? null,
        location: item.location ?? null,
        startTime: start.iso,
        endTime: end.iso,
        allDay: start.allDay,
        cancelled: item.status === "cancelled",
      });
    }

    pageToken = data.nextPageToken as string | undefined;
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken as string;
    if (!pageToken) break;
  }

  return { events, nextSyncToken, syncTokenExpired: false };
}

export async function insertGoogleEvent(
  accessToken: string,
  calendarId: string,
  event: {
    title: string;
    description?: string | null;
    location?: string | null;
    startTime: string;
    endTime: string;
    allDay: boolean;
  },
): Promise<{ id: string }> {
  const toGoogleTime = (iso: string) =>
    event.allDay ? { date: iso.slice(0, 10) } : { dateTime: iso };

  const res = await calendarFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify({
      summary: event.title,
      description: event.description || undefined,
      location: event.location || undefined,
      start: toGoogleTime(event.startTime),
      end: toGoogleTime(event.endTime),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to add event to Google Calendar (${res.status}): ${text}`);
  }
  const data = await res.json();
  return { id: data.id as string };
}
