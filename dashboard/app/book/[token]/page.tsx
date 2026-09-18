import { createClient } from "@/lib/supabase/server";
import { getCoachByBookingToken } from "@/lib/booking";
import { BookingScheduler } from "@/components/booking/BookingScheduler";

export const dynamic = "force-dynamic";

export default async function BookPage({ params }: { params: { token: string } }) {
  const supabase = await createClient();
  const coach = await getCoachByBookingToken(supabase, params.token);

  if (!coach) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="mb-2 text-lg font-semibold text-ink-primary">Booking link not available</h1>
        <p className="text-sm text-ink-secondary">This link is invalid. Ask for a new one.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-lg font-semibold text-ink-primary">
        Book time with {coach.fullName || "your coach"}
      </h1>
      <p className="mb-6 text-sm text-ink-secondary">Pick a date, then an open time.</p>
      <BookingScheduler coachId={coach.coachId} />
    </div>
  );
}
