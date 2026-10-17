import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { MonthGrid } from "./CalendarViews";
import type { CalendarEventRow } from "@/lib/calendar";

function makeEvent(overrides: Partial<CalendarEventRow> & { id: string; title: string; start_time: string; end_time: string }): CalendarEventRow {
  return {
    coach_id: "coach-1",
    client_id: "client-1",
    created_by: "coach-1",
    booker_name: null,
    booker_email: null,
    booker_phone: null,
    description: null,
    location: null,
    all_day: false,
    reminder_minutes_before: null,
    has_video_call: false,
    video_call_room_name: null,
    video_call_room_url: null,
    external_source: null,
    ...overrides,
  };
}

const ANCHOR = new Date("2026-10-12T12:00:00Z");

const meta = {
  component: MonthGrid,
  tags: ["ai-generated"],
  args: {
    anchorDate: ANCHOR,
    onSelectDay: fn(),
    onSelectEvent: fn(),
  },
} satisfies Meta<typeof MonthGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { events: [] },
};

export const WithEvents: Story = {
  args: {
    events: [
      makeEvent({ id: "1", title: "Coaching call: Alex", start_time: "2026-10-12T14:00:00Z", end_time: "2026-10-12T14:30:00Z" }),
      makeEvent({ id: "2", title: "Program review", start_time: "2026-10-15T18:00:00Z", end_time: "2026-10-15T18:30:00Z" }),
    ],
  },
};

export const Overflow: Story = {
  args: {
    events: [
      makeEvent({ id: "1", title: "Check-in: Alex", start_time: "2026-10-12T13:00:00Z", end_time: "2026-10-12T13:30:00Z" }),
      makeEvent({ id: "2", title: "Check-in: Jordan", start_time: "2026-10-12T14:00:00Z", end_time: "2026-10-12T14:30:00Z" }),
      makeEvent({ id: "3", title: "Check-in: Sam", start_time: "2026-10-12T15:00:00Z", end_time: "2026-10-12T15:30:00Z" }),
    ],
  },
};
