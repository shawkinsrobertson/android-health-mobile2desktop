import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";
import { Composer } from "./Composer";
import type { ChatMessageRow } from "@/lib/chat";

const REPLY_TO: ChatMessageRow = {
  id: "msg-1",
  thread_id: "thread-1",
  coach_id: "coach-1",
  client_id: "client-1",
  sender_id: "client-1",
  sender_role: "client",
  body: "What should I do instead of the barbell row?",
  reply_to_id: null,
  attachment_kind: null,
  attachment_path: null,
  attachment_mime: null,
  attachment_duration_seconds: null,
  pinned_at: null,
  pinned_by: null,
  created_at: "2026-10-12T14:00:00Z",
};

const meta = {
  component: Composer,
  tags: ["ai-generated"],
  args: {
    replyTo: null,
    onCancelReply: fn(),
    onSend: fn(),
  },
} satisfies Meta<typeof Composer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.type(canvas.getByPlaceholderText("Message…"), "Great job this week!");
    await userEvent.click(canvas.getByRole("button", { name: /^send$/i }));
    await expect(args.onSend).toHaveBeenCalledTimes(1);
    const sentForm = (args.onSend as unknown as { mock: { calls: FormData[][] } }).mock.calls[0][0];
    await expect(sentForm.get("body")).toBe("Great job this week!");
  },
};

export const Replying: Story = {
  args: { replyTo: REPLY_TO },
};
