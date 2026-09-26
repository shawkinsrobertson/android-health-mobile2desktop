import Link from "next/link";
import { getCurrentProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { listThreadsForUnread } from "@/lib/chat";
import { InboxNavLink } from "@/components/chat/InboxNavLink";
import { CalendarIcon } from "@/components/icons/CalendarIcon";
import { TasksIcon } from "@/components/icons/TasksIcon";
import { ClientsIcon } from "@/components/icons/ClientsIcon";
import { LibrariesIcon } from "@/components/icons/LibrariesIcon";

export async function NavBar() {
  const profile = await getCurrentProfile();

  const initialThreads =
    profile && (profile.role === "coach" || profile.role === "client")
      ? await listThreadsForUnread(await createClient(), profile.id, profile.role)
      : [];

  return (
    <header className="border-b border-[color:var(--border-hairline)] bg-surface">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
        <Link href="/" className="font-semibold text-ink-primary">
          Health Sync
        </Link>
        <nav className="flex flex-1 gap-4 text-sm text-ink-secondary">
          {profile?.role === "coach" && (
            <Link href="/dashboard" className="flex items-center gap-1.5 hover:text-ink-primary">
              <ClientsIcon className="h-4 w-4" />
              Clients
            </Link>
          )}
          {profile?.role === "coach" && (
            <Link href="/dashboard/library" className="flex items-center gap-1.5 hover:text-ink-primary">
              <LibrariesIcon className="h-4 w-4" />
              Library
            </Link>
          )}
          {profile?.role === "coach" && (
            <Link href="/dashboard/calendar" className="flex items-center gap-1.5 hover:text-ink-primary">
              <CalendarIcon className="h-4 w-4" />
              Calendar
            </Link>
          )}
          {profile?.role === "coach" && (
            <InboxNavLink href="/dashboard/inbox" role="coach" profileId={profile.id} initialThreads={initialThreads} />
          )}
          {profile?.role === "client" && (
            <Link href="/client" className="hover:text-ink-primary">
              My dashboard
            </Link>
          )}
          {profile?.role === "client" && (
            <Link href="/client/check-in" className="flex items-center gap-1.5 hover:text-ink-primary">
              <TasksIcon className="h-4 w-4" />
              Check-in
            </Link>
          )}
          {profile?.role === "client" && (
            <InboxNavLink href="/client/inbox" role="client" profileId={profile.id} initialThreads={initialThreads} />
          )}
        </nav>
        {profile ? (
          <form action="/auth/signout" method="post" className="flex items-center gap-3">
            <span className="text-xs text-ink-muted">{profile.email}</span>
            <button type="submit" className="text-xs text-ink-secondary hover:text-ink-primary">
              Sign out
            </button>
          </form>
        ) : (
          <Link href="/login" className="text-sm text-ink-secondary hover:text-ink-primary">
            Sign in / Sign up
          </Link>
        )}
      </div>
    </header>
  );
}
