import { createClient } from "@/lib/supabase/server";
import { requestClientMagicLink } from "./actions";

export const dynamic = "force-dynamic";

interface InviteStatus {
  status: string;
  expires_at: string;
  coach_name: string | null;
}

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { sent?: string; error?: string };
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invite_status")
    .select("status, expires_at, coach_name")
    .eq("token", params.token)
    .single();
  const invite = data as InviteStatus | null;
  const valid = !!invite && invite.status === "pending" && new Date(invite.expires_at) > new Date();

  if (!invite || !valid) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="mb-2 text-lg font-semibold text-ink-primary">Invite not available</h1>
        <p className="text-sm text-ink-secondary">
          This invite link is invalid, already used, or has expired. Ask your coach to send you a
          new one.
        </p>
      </div>
    );
  }

  const { sent, error } = searchParams;

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-lg font-semibold text-ink-primary">
        Join {invite.coach_name || "your coach"}
      </h1>
      <p className="mb-6 text-sm text-ink-secondary">
        Enter your email and we&apos;ll send you a link to create your account.
      </p>

      {sent ? (
        <p className="rounded-lg border border-[color:var(--border-hairline)] bg-[color:var(--page-plane)] px-4 py-3 text-sm text-ink-primary">
          Check your email for a link to finish setting up your account.
        </p>
      ) : (
        <form action={requestClientMagicLink} className="flex flex-col gap-3">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <input type="hidden" name="token" value={params.token} />
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm text-ink-primary outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-[color:var(--series-steps)] px-4 py-2 text-sm font-medium text-white"
          >
            Send sign-in link
          </button>
        </form>
      )}
    </div>
  );
}
