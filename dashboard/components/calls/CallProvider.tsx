"use client";

import { createContext, useContext, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/browser";
import { startCall, joinCall, declineCall as declineCallAction, endCall as endCallAction } from "@/lib/call-actions";
import type { ChatCallRow } from "@/lib/calls";

// The client only ever needs a slice of the DB row -- coach_id/client_id
// exist for RLS, not for anything rendered here.
export interface ActiveCallState {
  id: string;
  status: ChatCallRow["status"];
  initiated_by: string;
  daily_room_url: string;
}

interface CallContextValue {
  call: ActiveCallState | null;
  token: string | null;
  isInitiator: boolean;
  isBusy: boolean;
  placeCall: () => void;
  acceptCall: () => void;
  declineCall: () => void;
  hangUp: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within a CallProvider");
  return ctx;
}

// Owns call state for one chat thread: places/accepts/declines/ends calls
// via the server actions in lib/call-actions.ts, and stays in sync with the
// other participant through a Realtime subscription on chat_calls -- same
// pattern as ThreadView's message subscription. The Daily meeting token is
// intentionally never persisted anywhere (not in chat_calls, not restored
// across a refresh mid-call beyond a fresh re-join) -- it's a short-lived,
// per-participant credential that only ever lives in this component's state.
export function CallProvider({
  threadId,
  myProfileId,
  initialCall,
  children,
}: {
  threadId: string;
  myProfileId: string;
  initialCall: ActiveCallState | null;
  children: ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [call, setCall] = useState<ActiveCallState | null>(initialCall);
  const [token, setToken] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [, startTransition] = useTransition();

  // A page load that lands mid-call (e.g. a refresh) has no in-memory
  // token yet -- silently re-join to get a fresh one. Never do this for a
  // still-ringing call, which would auto-accept an incoming call the
  // person hasn't looked at yet.
  useEffect(() => {
    if (initialCall?.status === "accepted") {
      joinCall(initialCall.id)
        .then((result) => setToken(result.token))
        .catch(() => setCall(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`chat-call-${threadId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_calls", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          const row = payload.new as ChatCallRow;
          if (row.status === "declined" || row.status === "ended") {
            setCall(null);
            setToken(null);
            return;
          }
          setCall({
            id: row.id,
            status: row.status,
            initiated_by: row.initiated_by,
            daily_room_url: row.daily_room_url,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, threadId]);

  function placeCall() {
    setIsBusy(true);
    startTransition(async () => {
      try {
        const result = await startCall(threadId);
        setCall({
          id: result.callId,
          status: "ringing",
          initiated_by: myProfileId,
          daily_room_url: result.roomUrl,
        });
        setToken(result.token);
      } finally {
        setIsBusy(false);
      }
    });
  }

  function acceptCall() {
    if (!call) return;
    setIsBusy(true);
    const callId = call.id;
    startTransition(async () => {
      try {
        const result = await joinCall(callId);
        setCall((prev) => (prev && prev.id === callId ? { ...prev, status: "accepted" } : prev));
        setToken(result.token);
      } finally {
        setIsBusy(false);
      }
    });
  }

  function declineCall() {
    if (!call) return;
    const callId = call.id;
    setCall(null);
    setToken(null);
    startTransition(async () => {
      await declineCallAction(callId);
    });
  }

  function hangUp() {
    if (!call) return;
    const callId = call.id;
    setCall(null);
    setToken(null);
    startTransition(async () => {
      await endCallAction(callId);
    });
  }

  const value: CallContextValue = {
    call,
    token,
    isInitiator: call?.initiated_by === myProfileId,
    isBusy,
    placeCall,
    acceptCall,
    declineCall,
    hangUp,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}
