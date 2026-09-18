import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { listEvents } from "@/lib/calendar";
import { rangeForView } from "@/lib/calendar-grid";
import { getCoachAvailability } from "@/lib/booking";
import { CalendarWorkspace } from "@/components/calendar/CalendarWorkspace";

export const dynamic = "force-dynamic";

const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";

interface ClientRow {
  profile_id: string;
  profiles: { full_name: string | null; email: string } | null;
}

export default async function CoachCalendarPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  const supabase = await createClient();

  const [clientsRes, bookingProfileRes, googleConnectionRes, availability, initialEvents] = await Promise.all([
    supabase
      .from("client_profiles")
      .select("profile_id, profiles!client_profiles_profile_id_fkey(full_name, email)")
      .eq("coach_id", profile.id),
    supabase.from("profiles").select("booking_token").eq("id", profile.id).single(),
    supabase
      .from("calendar_connections")
      .select("id")
      .eq("profile_id", profile.id)
      .eq("provider", "google")
      .maybeSingle(),
    getCoachAvailability(supabase, profile.id),
    listEvents(supabase, { coachId: profile.id }, rangeForView("month", new Date())),
  ]);

  const clients = (clientsRes.data ?? []) as unknown as ClientRow[];
  const assignableClients = clients.map((c) => ({
    id: c.profile_id,
    name: c.profiles?.full_name || c.profiles?.email || "Unnamed client",
  }));
  const bookingToken = bookingProfileRes.data?.booking_token ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-primary">Calendar</h1>
        <p className="text-sm text-ink-secondary">
          Your full schedule, booking link, and availability in one place.
        </p>
      </div>
      <CalendarWorkspace
        coachId={profile.id}
        initialEvents={initialEvents}
        assignableClients={assignableClients}
        creatorHasGoogleConnection={!!googleConnectionRes.data}
        bookingUrl={bookingToken ? `${siteUrl}/book/${bookingToken}` : null}
        initialAvailability={availability}
      />
    </div>
  );
}
