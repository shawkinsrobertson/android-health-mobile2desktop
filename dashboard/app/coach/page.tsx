import { ChatPanel } from "@/components/ChatPanel";

export default function CoachPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-ink-primary">Coach</h1>
        <p className="text-sm text-ink-secondary">
          Chat with an AI coach grounded in your synced Health Connect data — steps,
          heart rate, sleep, and workouts, pulled fresh from Supabase on every message.
        </p>
      </div>
      <ChatPanel />
    </div>
  );
}
