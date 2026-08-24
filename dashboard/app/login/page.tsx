import { sendCoachMagicLink } from "./actions";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { sent?: string; error?: string };
}) {
  const { sent, error } = searchParams;

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-lg font-semibold text-ink-primary">Coach sign in</h1>
      <p className="mb-6 text-sm text-ink-secondary">
        Enter your email and we&apos;ll send you a sign-in link -- no password needed.
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
        Client? Use the invite link your coach sent you instead.
      </p>
    </div>
  );
}
