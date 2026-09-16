"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// A single, page-wide "active timer" -- only one set is ever being timed
// at once, so this is simpler than per-row local state: starting a work
// or rest timer from anywhere on the page (see SessionLogger) puts it
// here, an overlay (TimerOverlay) renders it full-screen, and minimizing
// just flips a flag rather than unmounting -- the interval that's
// actually counting keeps running underneath either way, and a fixed
// banner (TimerBanner) shows instead when minimized.

export interface ActiveTimer {
  kind: "work" | "rest";
  setId: string;
  exerciseName: string;
  setNumber: number;
  remainingSeconds: number;
  elapsedSeconds: number;
  minimized: boolean;
}

interface StartTimerArgs {
  kind: "work" | "rest";
  setId: string;
  exerciseName: string;
  setNumber: number;
  seconds: number;
  onFinish: (elapsedSeconds: number) => void;
}

interface ActiveTimerContextValue {
  timer: ActiveTimer | null;
  start: (args: StartTimerArgs) => void;
  adjust: (deltaSeconds: number) => void;
  minimize: () => void;
  restore: () => void;
  finish: () => void; // "Done" (work) / "Skip" (rest) -- same mechanics, different label at the call site
}

const ActiveTimerContext = createContext<ActiveTimerContextValue | null>(null);

export function useActiveTimer(): ActiveTimerContextValue {
  const ctx = useContext(ActiveTimerContext);
  if (!ctx) throw new Error("useActiveTimer must be used within an ActiveTimerProvider");
  return ctx;
}

export function ActiveTimerProvider({ children }: { children: React.ReactNode }) {
  const [timer, setTimer] = useState<ActiveTimer | null>(null);
  const onFinishRef = useRef<((elapsed: number) => void) | null>(null);

  // Depending only on setId (stable for the life of one timer, unlike the
  // timer object itself which changes every tick) keeps this from
  // tearing down and recreating the interval every second.
  useEffect(() => {
    if (!timer) return;
    const interval = setInterval(() => {
      setTimer((prev) =>
        prev ? { ...prev, remainingSeconds: Math.max(0, prev.remainingSeconds - 1), elapsedSeconds: prev.elapsedSeconds + 1 } : prev,
      );
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer?.setId]);

  const start = useCallback((args: StartTimerArgs) => {
    onFinishRef.current = args.onFinish;
    setTimer({
      kind: args.kind,
      setId: args.setId,
      exerciseName: args.exerciseName,
      setNumber: args.setNumber,
      remainingSeconds: Math.max(0, args.seconds),
      elapsedSeconds: 0,
      minimized: false,
    });
  }, []);

  const adjust = useCallback((deltaSeconds: number) => {
    setTimer((prev) => (prev ? { ...prev, remainingSeconds: Math.max(0, prev.remainingSeconds + deltaSeconds) } : prev));
  }, []);

  const minimize = useCallback(() => {
    setTimer((prev) => (prev ? { ...prev, minimized: true } : prev));
  }, []);

  const restore = useCallback(() => {
    setTimer((prev) => (prev ? { ...prev, minimized: false } : prev));
  }, []);

  const finish = useCallback(() => {
    setTimer((prev) => {
      if (prev) onFinishRef.current?.(prev.elapsedSeconds);
      return null;
    });
    onFinishRef.current = null;
  }, []);

  return (
    <ActiveTimerContext.Provider value={{ timer, start, adjust, minimize, restore, finish }}>
      {children}
    </ActiveTimerContext.Provider>
  );
}
