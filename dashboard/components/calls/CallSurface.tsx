"use client";

import { useState } from "react";
import { DailyProvider } from "@daily-co/daily-react";
import { useCall } from "./CallProvider";
import { CallScreen } from "./CallScreen";

// Single dispatcher a chat page mounts once: renders nothing when there's
// no call, a ringing overlay (incoming or outgoing) while status is
// "ringing", and the actual call screen once "accepted". Video-only vs.
// audio-only isn't a real distinction here -- camera can always be toggled
// off from inside CallScreen, so there's just one call type.
export function CallSurface({ counterpartName }: { counterpartName: string }) {
  const { call, token, isInitiator, isBusy, acceptCall, declineCall, hangUp } = useCall();

  if (!call) return null;

  if (call.status === "ringing") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6">
        <div className="w-full max-w-sm rounded-xl bg-surface p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--accent)]/20 text-3xl">
            📞
          </div>
          <h2 className="text-base font-semibold text-ink-primary">
            {isInitiator ? `Calling ${counterpartName}…` : `${counterpartName} is calling…`}
          </h2>
          <p className="mt-1 text-sm text-ink-secondary">
            {isInitiator ? "Waiting for them to pick up." : "Incoming call"}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            {isInitiator ? (
              <button
                type="button"
                onClick={declineCall}
                disabled={isBusy}
                className="rounded-lg border border-[color:var(--border-hairline)] px-5 py-2.5 text-sm font-medium text-ink-secondary disabled:opacity-60"
              >
                Cancel
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={declineCall}
                  disabled={isBusy}
                  className="rounded-lg border border-[color:var(--border-hairline)] px-5 py-2.5 text-sm font-medium text-red-600 disabled:opacity-60 dark:text-red-400"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={acceptCall}
                  disabled={isBusy}
                  className="rounded-lg bg-[color:var(--accent)] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                >
                  Accept
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (call.status === "accepted") {
    if (!token) {
      // Rejoining after a refresh -- CallProvider is fetching a fresh
      // token; show a lightweight placeholder rather than nothing.
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <p className="text-sm text-white/80">Rejoining call…</p>
        </div>
      );
    }
    return (
      <DailyProvider url={call.daily_room_url} token={token}>
        <CallScreenGate counterpartName={counterpartName} onHangUp={hangUp} />
      </DailyProvider>
    );
  }

  return null;
}

// A tiny join gate so the (rare) "call object failed to load" case doesn't
// crash the tile-rendering logic in CallScreen itself.
function CallScreenGate({ counterpartName, onHangUp }: { counterpartName: string; onHangUp: () => void }) {
  const [joinError, setJoinError] = useState<string | null>(null);

  if (joinError) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/90 px-6 text-center">
        <p className="text-sm text-white">{joinError}</p>
        <button
          type="button"
          onClick={onHangUp}
          className="rounded-lg bg-[color:var(--accent)] px-5 py-2.5 text-sm font-medium text-white"
        >
          Close
        </button>
      </div>
    );
  }

  return <CallScreen counterpartName={counterpartName} onHangUp={onHangUp} onError={setJoinError} />;
}
