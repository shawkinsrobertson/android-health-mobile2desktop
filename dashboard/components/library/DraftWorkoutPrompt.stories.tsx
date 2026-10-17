import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";
import { DraftWorkoutPrompt } from "./DraftWorkoutPrompt";

const meta = {
  component: DraftWorkoutPrompt,
  tags: ["ai-generated"],
} satisfies Meta<typeof DraftWorkoutPrompt>;

export default meta;
type Story = StoryObj<typeof meta>;

// Submits the form and lets it hit the real fetch("/api/library/workouts/draft")
// call, mocked via .storybook/msw-handlers.ts -- proves the MSW wiring
// actually intercepts it (an unmocked request would fail in this test
// environment and show the component's own error text).
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByPlaceholderText(/upper body hypertrophy/i),
      "Leg day, 30 minutes, dumbbells only",
    );
    await userEvent.click(canvas.getByRole("button", { name: /draft workout/i }));
    await waitFor(() => {
      expect(canvas.queryByText(/couldn't draft a workout/i)).not.toBeInTheDocument();
    });
  },
};
