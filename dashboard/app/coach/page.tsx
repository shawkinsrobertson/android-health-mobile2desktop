import { ChatPanel } from "@/components/ChatPanel";

export default function CoachPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-ink-primary">Coach</h1>
        <p className="text-sm text-ink-secondary">
          A chat shell for the AI training assistant. Wire an LLM into
          app/api/chat/route.ts to make this live — it already has your synced Health
          Connect data available via lib/queries.ts.
        </p>
      </div>
      <ChatPanel />
    </div>
  );
}
