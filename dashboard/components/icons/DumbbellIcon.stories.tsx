import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DumbbellIcon } from "./DumbbellIcon";

const meta = {
  component: DumbbellIcon,
  tags: ["ai-generated"],
} satisfies Meta<typeof DumbbellIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { className: "h-6 w-6" },
};

export const Large: Story = {
  args: { className: "h-12 w-12 text-[color:var(--accent)]" },
};
