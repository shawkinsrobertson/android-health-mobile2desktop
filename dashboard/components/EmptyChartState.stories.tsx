import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EmptyChartState } from "./EmptyChartState";

const meta = {
  component: EmptyChartState,
  tags: ["ai-generated"],
} satisfies Meta<typeof EmptyChartState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: "No data for this range yet" },
};

export const NotShared: Story = {
  args: { label: "This client hasn't shared this data type" },
};
