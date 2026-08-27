import Link from "next/link";
import { getCurrentProfile } from "@/lib/profile";

export async function NavBar() {
  const profile = await getCurrentProfile();

  return (
    <header className="border-b border-[color:var(--border-hairline)] bg-surface">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
        <span className="font-semibold text-ink-primary">Health Sync</span>
        <nav className="flex flex-1 gap-4 text-sm text-ink-secondary">
          <Link href="/" className="hover:text-ink-primary">
            Overview
          </Link>
          <Link href="/coach" className="hover:text-ink-primary">
            Coach
          </Link>
          {profile?.role === "coach" && (
            <Link href="/dashboard" className="hover:text-ink-primary">
              Clients
            </Link>
          )}
          {profile?.role === "client" && (
            <Link href="/client" className="hover:text-ink-primary">
              My dashboard
            </Link>
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
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
