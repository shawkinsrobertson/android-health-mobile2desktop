import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { PersonalRecordsList } from "./PersonalRecordsList";
import type { PersonalRecord } from "@/lib/personal-records";

const RECORDS: PersonalRecord[] = [
  { exerciseName: "Back Squat", weight: 225, reps: "5", achievedOn: "2026-10-01" },
  { exerciseName: "Bench Press", weight: 185, reps: "3", achievedOn: "2026-09-20" },
  { exerciseName: "Deadlift", weight: 315, reps: "1", achievedOn: "2026-08-15" },
];

const meta = {
  component: PersonalRecordsList,
  tags: ["ai-generated"],
  args: {
    weightUnit: "lbs",
  },
} satisfies Meta<typeof PersonalRecordsList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { records: [] },
};

export const AllRecords: Story = {
  args: { records: RECORDS },
};

export const CappedWithSeeAll: Story = {
  args: { records: RECORDS, limit: 2, seeAllHref: "/dashboard/clients/client-1/personal-records" },
  play: async ({ canvas }) => {
    const link = canvas.getByRole("link", { name: /see all 3 records/i });
    await expect(link).toHaveAttribute("href", "/dashboard/clients/client-1/personal-records");
  },
};
