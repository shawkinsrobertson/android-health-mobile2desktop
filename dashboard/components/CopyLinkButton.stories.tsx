import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CopyLinkButton } from "./CopyLinkButton";

const meta = {
  component: CopyLinkButton,
  tags: ["ai-generated"],
} satisfies Meta<typeof CopyLinkButton>;

export default meta;
type Story = StoryObj<typeof meta>;

// No play here -- the click handler depends on navigator.clipboard, which
// the shared preview deliberately never mocks (see .storybook/preview.tsx).
export const Default: Story = {
  args: { url: "https://example.com/book/abc123" },
};
