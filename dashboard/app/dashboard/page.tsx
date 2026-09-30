import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { listEvents } from "@/lib/calendar";
import { rangeForView } from "@/lib/calendar-grid";
import { listCoachThreads } from "@/lib/chat";
import { listTasks } from "@/lib/tasks";
import { CalendarCard } from "@/components/calendar/CalendarCard";
import { DailyBulletin } from "@/components/DailyBulletin";
import { TaskList } from "@/components/TaskList";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { createInviteLink } from "./actions";

export const dynamic = "force-dynamic";

const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";

interface ClientRow {
  profile_id: string;
  profiles: { full_name: string | null; email: string } | null;
}

interface RecentSessionRow {
  client_id: string;
  completed_at: string;
}

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  const supabase = await createClient();

  const [clientsRes, googleConnectionRes, bookingProfileRes, recentSessionsRes, threadItems, tasks] =
    await Promise.all([
      supabase
        .from("client_profiles")
        .select("profile_id, profiles!client_profiles_profile_id_fkey(full_name, email)")
        .eq("coach_id", profile.id),
      supabase
        .from("calendar_connections")
        .select("external_account_email, last_synced_at")
        .eq("profile_id", profile.id)
        .eq("provider", "google")
        .maybeSingle(),
      supabase.from("profiles").select("booking_token").eq("id", profile.id).single(),
      supabase
        .from("workout_sessions")
        .select("client_id, completed_at")
        .eq("coach_id", profile.id)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(5),
      listCoachThreads(supabase, profile.id),
      listTasks(supabase, profile.id),
    ]);

  const clients = (clientsRes.data ?? []) as unknown as ClientRow[];
  const bookingToken = bookingProfileRes.data?.booking_token ?? null;
  const nameByClientId = new Map(
    clients.map((c) => [c.profile_id, c.profiles?.full_name || c.profiles?.email || "Unnamed client"]),
  );

  const recentActivity = ((recentSessionsRes.data ?? []) as RecentSessionRow[]).map((row) => ({
    clientId: row.client_id,
    clientName: nameByClientId.get(row.client_id) ?? "A client",
    completedAt: row.completed_at,
  }));

  const unreadMessages = threadItems
    .filter((item) => item.unread)
    .map((item) => ({ clientId: item.clientId, clientName: item.clientName }));

  const todayRange = rangeForView("day", new Date());
  const todayEventsRaw = await listEvents(supabase, { coachId: profile.id }, todayRange);
  const todayEvents = todayEventsRaw.map((e) => ({ id: e.id, title: e.title, startTime: e.start_time }));

  const weekRange = rangeForView("week", new Date());
  const initialEvents = await listEvents(supabase, { coachId: profile.id }, weekRange);
  const assignableClients = clients.map((c) => ({
    id: c.profile_id,
    name: c.profiles?.full_name || c.profiles?.email || "Unnamed client",
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold text-ink-primary">Dashboard</h1>
        <p className="text-sm text-ink-secondary">Signed in as {profile.email}.</p>
      </div>

      <DailyBulletin recentActivity={recentActivity} unreadMessages={unreadMessages} todayEvents={todayEvents} />

      <CalendarCard
        scope={{ coachId: profile.id }}
        initialEvents={initialEvents}
        assignableClients={assignableClients}
        initialView="week"
        initialExpanded
        googleSync={{
          targetProfileId: profile.id,
          ownAccountEmail: googleConnectionRes.data?.external_account_email ?? null,
          lastSyncedAt: googleConnectionRes.data?.last_synced_at ?? null,
        }}
        creatorHasGoogleConnection={!!googleConnectionRes.data}
        booking={{
          bookingUrl: bookingToken ? `${siteUrl}/book/${bookingToken}` : null,
          availabilityHref: "/dashboard/calendar",
        }}
      />

      <TaskList initialTasks={tasks} />

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/library/workouts/new"
            className="rounded-lg border border-[color:var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-[color:var(--page-plane)]"
          >
            Create workout
          </Link>
          <Link
            href="/dashboard/library/programs/new"
            className="rounded-lg border border-[color:var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-[color:var(--page-plane)]"
          >
            Create program
          </Link>
          <form action={createInviteLink}>
            <button
              type="submit"
              className="rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
            >
              Generate client link
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
