import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { ClientSearchList } from "@/components/ClientSearchList";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { InviteLinkModal } from "@/components/InviteLinkModal";
import { createInviteLink } from "../actions";

export const dynamic = "force-dynamic";

const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";

interface InviteRow {
  token: string;
  client_name: string | null;
}

interface ClientRow {
  profile_id: string;
  onboarded_at: string | null;
  profiles: { full_name: string | null; email: string } | null;
}

export default async function ClientsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  const supabase = await createClient();

  const [invitesRes, clientsRes] = await Promise.all([
    // Pending + unexpired only -- used and expired links used to stay
    // listed forever. The coach can always generate a fresh one for the
    // rare case they need to re-send; nothing is destroyed, just no
    // longer shown here (the row itself still exists in the table).
    supabase
      .from("invite_links")
      .select("token, client_name")
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("client_profiles")
      .select("profile_id, onboarded_at, profiles!client_profiles_profile_id_fkey(full_name, email)")
      .eq("coach_id", profile.id),
  ]);

  const invites = (invitesRes.data ?? []) as InviteRow[];
  const clients = (clientsRes.data ?? []) as unknown as ClientRow[];
  const clientItems = clients.map((c) => ({
    profileId: c.profile_id,
    name: c.profiles?.full_name || c.profiles?.email || "Unnamed client",
    email: c.profiles?.email ?? "",
    onboarded: !!c.onboarded_at,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold text-ink-primary">Clients</h1>
        <p className="text-sm text-ink-secondary">
          Search your client roster, or generate a link below to invite a new one.
        </p>
      </div>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-primary">Invite links</h2>
          <InviteLinkModal createInviteLink={createInviteLink} />
        </div>

        {invites.length === 0 ? (
          <p className="text-sm text-ink-muted">No pending invite links.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {invites.map((invite) => {
              const url = `${siteUrl}/join/${invite.token}`;
              return (
                <li
                  key={invite.token}
                  className="flex items-center gap-2 rounded-lg bg-[color:var(--page-plane)] px-3 py-2 text-sm"
                >
                  {invite.client_name && (
                    <span className="shrink-0 font-medium text-ink-primary">{invite.client_name}</span>
                  )}
                  <code className="flex-1 truncate text-ink-secondary">{url}</code>
                  <CopyLinkButton url={url} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink-primary">Your clients</h2>
        {clientsRes.error ? (
          <p className="text-sm text-danger">
            Couldn&apos;t load clients: {clientsRes.error.message}
          </p>
        ) : clientItems.length === 0 ? (
          <p className="text-sm text-ink-muted">No clients yet -- send someone an invite link above.</p>
        ) : (
          <ClientSearchList clients={clientItems} />
        )}
      </section>
    </div>
  );
}
