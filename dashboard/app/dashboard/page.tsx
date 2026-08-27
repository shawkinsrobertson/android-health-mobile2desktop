import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { createInviteLink } from "./actions";

export const dynamic = "force-dynamic";

const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";

interface InviteRow {
  token: string;
  status: string;
  expires_at: string;
  used_by: string | null;
}

interface ClientRow {
  profile_id: string;
  onboarded_at: string | null;
  profiles: { full_name: string | null; email: string } | null;
}

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  const supabase = await createClient();

  const [invitesRes, clientsRes] = await Promise.all([
    supabase
      .from("invite_links")
      .select("token, status, expires_at, used_by")
      .order("created_at", { ascending: false }),
    supabase
      .from("client_profiles")
      // client_profiles has two FKs into profiles (profile_id for the
      // client's own row, coach_id for their coach's) -- plain
      // `profiles(...)` is ambiguous between them and PostgREST errors
      // rather than guessing. Naming the FK explicitly picks profile_id.
      .select("profile_id, onboarded_at, profiles!client_profiles_profile_id_fkey(full_name, email)")
      .eq("coach_id", profile.id),
  ]);

  const invites = (invitesRes.data ?? []) as InviteRow[];
  const clients = (clientsRes.data ?? []) as unknown as ClientRow[];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold text-ink-primary">Your clients</h1>
        <p className="text-sm text-ink-secondary">
          Signed in as {profile.email}. Generate a link below and send it to a new client so
          they can create their account.
        </p>
      </div>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-primary">Invite links</h2>
          <form action={createInviteLink}>
            <button
              type="submit"
              className="rounded-lg bg-[color:var(--series-steps)] px-3 py-1.5 text-xs font-medium text-white"
            >
              Generate invite link
            </button>
          </form>
        </div>

        {invites.length === 0 ? (
          <p className="text-sm text-ink-muted">No invite links yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {invites.map((invite) => {
              const url = `${siteUrl}/join/${invite.token}`;
              const expired = invite.status === "pending" && new Date(invite.expires_at) < new Date();
              const label = expired ? "expired" : invite.status;
              return (
                <li
                  key={invite.token}
                  className="flex items-center gap-2 rounded-lg bg-[color:var(--page-plane)] px-3 py-2 text-sm"
                >
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                      label === "used"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                        : label === "expired"
                          ? "bg-ink-muted/20 text-ink-muted"
                          : "bg-[color:var(--series-steps)]/20 text-[color:var(--series-steps)]"
                    }`}
                  >
                    {label}
                  </span>
                  <code className="flex-1 truncate text-ink-secondary">{url}</code>
                  {label === "pending" && <CopyLinkButton url={url} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">Clients</h2>
        {clientsRes.error ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            Couldn&apos;t load clients: {clientsRes.error.message}
          </p>
        ) : clients.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No clients yet -- send someone an invite link above.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {clients.map((client) => (
              <li key={client.profile_id}>
                <Link
                  href={`/dashboard/clients/${client.profile_id}`}
                  className="flex items-center justify-between rounded-lg bg-[color:var(--page-plane)] px-3 py-2 text-sm hover:bg-[color:var(--border-hairline)]"
                >
                  <span className="text-ink-primary">
                    {client.profiles?.full_name || client.profiles?.email || "Unnamed client"}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {client.onboarded_at ? "onboarded" : "invited, not onboarded yet"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
