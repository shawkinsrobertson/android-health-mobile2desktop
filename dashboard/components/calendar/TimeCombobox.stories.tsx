import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";
import { TimeCombobox } from "./TimeCombobox";

const meta = {
  component: TimeCombobox,
  tags: ["ai-generated"],
  args: {
    className: "rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1 text-sm",
  },
} satisfies Meta<typeof TimeCombobox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: "09:00",
    onChange: fn(),
  },
};

export const Evening: Story = {
  args: {
    value: "18:30",
    onChange: fn(),
  },
};

// Typing filters the dropdown by substring, and clicking an option commits
// it via onChange -- the one interaction this widget is responsible for.
export const FilterAndSelect: Story = {
  args: {
    value: "09:00",
    onChange: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    const input = canvas.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "2:30 A");
    const option = await canvas.findByRole("button", { name: "2:30 AM" });
    await userEvent.click(option);
    await expect(args.onChange).toHaveBeenCalledWith("02:30");
  },
};
