"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DailyAudio,
  DailyVideo,
  useDaily,
  useDailyEvent,
  useLocalSessionId,
  useMediaTrack,
  useMeetingState,
  useParticipantIds,
} from "@daily-co/daily-react";

// The actual in-call UI -- must render inside <DailyProvider>, which
// CallSurface sets up once it has a room URL + token. 1:1 only (matches the
// thread model), so layout is just "the other person, full-screen" plus a
// small self-view tile, rather than a general participant grid.
export function CallScreen({
  counterpartName,
  onHangUp,
  onError,
}: {
  counterpartName: string;
  onHangUp: () => void;
  onError: (message: string) => void;
}) {
  const daily = useDaily();
  const meetingState = useMeetingState();
  const localSessionId = useLocalSessionId();
  const participantIds = useParticipantIds();
  const remoteId = participantIds.find((id) => id !== localSessionId) ?? null;

  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  useEffect(() => {
    if (daily && meetingState === "new") {
      daily.join().catch(() => onError("Couldn't join the call."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily, meetingState]);

  const handleError = useCallback(() => onError("The call ran into a connection problem."), [onError]);
  useDailyEvent("error", handleError);
  const handleLeft = useCallback(() => onHangUp(), [onHangUp]);
  useDailyEvent("left-meeting", handleLeft);

  const remoteVideo = useMediaTrack(remoteId ?? "", "video");
  const localVideo = useMediaTrack(localSessionId, "video");

  function toggleMic() {
    daily?.setLocalAudio(micMuted);
    setMicMuted((v) => !v);
  }

  function toggleCamera() {
    daily?.setLocalVideo(cameraOff);
    setCameraOff((v) => !v);
  }

  function hangUp() {
    onHangUp();
  }

  const joining = meetingState === "new" || meetingState === "loading" || meetingState === "joining-meeting";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <DailyAudio />

      <div className="relative flex-1">
        {joining || !remoteId ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-white/80">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-3xl">
              {counterpartName.slice(0, 1).toUpperCase()}
            </div>
            <p className="text-sm">{joining ? "Connecting…" : `Waiting for ${counterpartName}…`}</p>
          </div>
        ) : remoteVideo.isOff ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-white/80">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-3xl">
              {counterpartName.slice(0, 1).toUpperCase()}
            </div>
            <p className="text-sm">{counterpartName}&apos;s camera is off</p>
          </div>
        ) : (
          <DailyVideo automirror sessionId={remoteId} type="video" fit="cover" className="h-full w-full" />
        )}

        {localSessionId && !localVideo.isOff && (
          <div className="absolute bottom-4 right-4 h-32 w-24 overflow-hidden rounded-lg border border-white/20 bg-black sm:h-40 sm:w-32">
            <DailyVideo automirror sessionId={localSessionId} type="video" fit="cover" className="h-full w-full" />
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 bg-black/60 px-6 py-5">
        <button
          type="button"
          onClick={toggleMic}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-lg text-white"
          aria-label={micMuted ? "Unmute" : "Mute"}
        >
          {micMuted ? "🔇" : "🎙️"}
        </button>
        <button
          type="button"
          onClick={toggleCamera}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-lg text-white"
          aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}
        >
          {cameraOff ? "🚫" : "📷"}
        </button>
        <button
          type="button"
          onClick={hangUp}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-lg text-white"
          aria-label="Hang up"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
