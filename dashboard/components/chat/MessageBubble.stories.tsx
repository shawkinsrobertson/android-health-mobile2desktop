import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessageRow } from "@/lib/chat";

// Only used by AttachmentView when message.attachment_path is set -- none
// of these stories set one, so this stub is never actually called.
const supabaseStub = {} as unknown as SupabaseClient;

function makeMessage(overrides: Partial<ChatMessageRow> & { id: string }): ChatMessageRow {
  return {
    thread_id: "thread-1",
    coach_id: "coach-1",
    client_id: "client-1",
    sender_id: "coach-1",
    sender_role: "coach",
    body: null,
    reply_to_id: null,
    attachment_kind: null,
    attachment_path: null,
    attachment_mime: null,
    attachment_duration_seconds: null,
    pinned_at: null,
    pinned_by: null,
    created_at: "2026-10-12T14:00:00Z",
    ...overrides,
  };
}

const meta = {
  component: MessageBubble,
  tags: ["ai-generated"],
  args: {
    reactions: [],
    replyTo: null,
    myProfileId: "coach-1",
    supabase: supabaseStub,
    onReply: fn(),
    onToggleReaction: fn(),
    onTogglePin: fn(),
  },
} satisfies Meta<typeof MessageBubble>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mine: Story = {
  args: {
    message: makeMessage({ id: "msg-1", body: "Great work on the last session!", sender_role: "coach" }),
    isMine: true,
  },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: /^pin$/i }));
    await expect(args.onTogglePin).toHaveBeenCalledWith("msg-1");
  },
};

export const Theirs: Story = {
  args: {
    message: makeMessage({ id: "msg-2", body: "Sounds good, see you Thursday.", sender_role: "client" }),
    isMine: false,
    replyTo: makeMessage({ id: "msg-1", body: "Great work on the last session!", sender_role: "coach" }),
  },
};

export const WithReactionAndPin: Story = {
  args: {
    message: makeMessage({
      id: "msg-3",
      body: "New PR on squat today",
      sender_role: "client",
      pinned_at: "2026-10-12T15:00:00Z",
    }),
    isMine: false,
    reactions: [
      { id: "r1", message_id: "msg-3", profile_id: "coach-1", emoji: "\u{1F525}", created_at: "2026-10-12T15:01:00Z" },
      { id: "r2", message_id: "msg-3", profile_id: "coach-1", emoji: "\u{1F525}", created_at: "2026-10-12T15:02:00Z" },
    ],
  },
};
