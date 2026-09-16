import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { postAuthDestination } from "@/lib/auth-redirect";
import { sendCoachMagicLink } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { sent?: string; error?: string };
}) {
  // "/" and "/coach" both funnel here unconditionally now (see their own
  // pages' comments), so this is the one place that has to tell an
  // already-signed-in visitor apart from someone who actually needs to
  // sign in -- otherwise every "opening the app" visit would dead-end on
  // a sign-in form for someone who's already signed in.
  const supabase = await createClient();
  const destination = await postAuthDestination(supabase);
  if (destination) redirect(destination);

  const { sent, error } = searchParams;

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-lg font-semibold text-ink-primary">Sign in</h1>
      <p className="mb-6 text-sm text-ink-secondary">
        For coaches, and for clients signing back in after their first visit. Enter your email
        and we&apos;ll send you a sign-in link -- no password needed.
      </p>

      {sent ? (
        <p className="rounded-lg border border-[color:var(--border-hairline)] bg-[color:var(--page-plane)] px-4 py-3 text-sm text-ink-primary">
          Check your email for a sign-in link. You can close this tab.
        </p>
      ) : (
        <form action={sendCoachMagicLink} className="flex flex-col gap-3">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
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

      <p className="mt-6 text-xs text-ink-muted">
        New client, no account yet? You&apos;ll need an invite link from your coach -- that link
        only works once, so sign in here after that.
      </p>
    </div>
  );
}
