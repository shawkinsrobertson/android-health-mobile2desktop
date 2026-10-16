import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";
import { ProposalCard } from "./ProposalCard";

const meta = {
  component: ProposalCard,
  tags: ["ai-generated"],
  args: {
    onApprove: fn(),
    onDiscard: fn(),
  },
} satisfies Meta<typeof ProposalCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DraftMessage: Story = {
  args: {
    typeLabel: "Draft message",
    summary: "Drafted message to this client -- edit below if you want, then send.",
    createdAt: "2026-10-12T14:30:00Z",
    approveLabel: "Send",
  },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: /send/i }));
    // Approve now opens a confirm dialog first -- its own confirm button
    // shares the approveLabel ("Send"), so scope the second click to the
    // dialog to disambiguate it from the original button underneath.
    const dialog = within(canvas.getByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: /send/i }));
    await expect(args.onApprove).toHaveBeenCalledTimes(1);
  },
};

export const ProgramChange: Story = {
  args: {
    typeLabel: "Program change",
    summary: "Increase squat sets from 3 to 4 (Upper/Lower Split)",
    createdAt: "2026-10-12T09:15:00Z",
    approveLabel: "Apply to program",
    children: (
      <div className="mb-1 text-sm text-ink-primary">
        <span className="font-medium">Back Squat</span>
        <ul className="mt-0.5 ml-4 list-disc text-ink-secondary">
          <li>Sets: 3 → 4</li>
        </ul>
      </div>
    ),
  },
};

// CssCheck: proves the shared preview actually loaded the real app CSS --
// this button uses bg-[color:var(--accent)], a literal design-token
// reference, which is the same hex (#c1573b) in both light and dark mode.
export const CssCheck: Story = {
  args: {
    typeLabel: "Schedule call",
    summary: "Coaching call -- Mon, Oct 12, 2:00 PM - 2:30 PM",
    createdAt: "2026-10-12T09:15:00Z",
    approveLabel: "Book call",
  },
  play: async ({ canvas }) => {
    const button = canvas.getByRole("button", { name: /book call/i });
    // ProposalCard's approve button uses bg-[color:var(--accent)] --
    // fails if the app's globals.css did not load into the preview.
    await expect(getComputedStyle(button).backgroundColor).toBe("rgb(193, 87, 59)");
  },
};
