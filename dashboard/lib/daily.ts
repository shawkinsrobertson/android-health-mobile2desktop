// Server-only Daily.co REST client -- plain fetch calls, no SDK needed for
// room/token creation (the SDK is a browser thing, for actually joining a
// call). DAILY_API_KEY is a true secret and must only ever be read here,
// never in a "use client" file or passed to the browser -- only the
// short-lived per-participant meeting token returned by
// createMeetingToken() is safe to hand to the client.

const DAILY_API_BASE = "https://api.daily.co/v1";

function apiKey(): string {
  const key = process.env.DAILY_API_KEY;
  if (!key) throw new Error("DAILY_API_KEY is not set -- calling has nothing to connect to.");
  return key;
}

async function dailyFetch(path: string, init: RequestInit) {
  const res = await fetch(`${DAILY_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Daily API ${path} failed (${res.status}): ${body || res.statusText}`);
  }
  return res.json();
}

// One fresh, private room per call attempt (see 0012_chat_calls.sql) --
// `exp` is a safety net so an abandoned room (crashed tab, missed endCall)
// cleans itself up rather than lingering forever.
export async function createDailyRoom(roomName: string): Promise<{ url: string }> {
  const exp = Math.floor(Date.now() / 1000) + 2 * 60 * 60; // 2 hours out
  const data = await dailyFetch("/rooms", {
    method: "POST",
    body: JSON.stringify({
      name: roomName,
      privacy: "private",
      properties: {
        exp,
        max_participants: 2,
        enable_screenshare: false,
        enable_chat: false,
        eject_at_room_exp: true,
      },
    }),
  });
  return { url: data.url as string };
}

// A short-lived, per-participant credential -- this is what actually goes
// to the browser (via a server action's return value), never the API key.
export async function createMeetingToken(roomName: string, userName: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
  const data = await dailyFetch("/meeting-tokens", {
    method: "POST",
    body: JSON.stringify({
      properties: { room_name: roomName, user_name: userName, exp },
    }),
  });
  return data.token as string;
}
