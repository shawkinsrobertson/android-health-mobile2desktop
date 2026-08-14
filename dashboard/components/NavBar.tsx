import Link from "next/link";

export function NavBar() {
  return (
    <header className="border-b border-[color:var(--border-hairline)] bg-surface">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
        <span className="font-semibold text-ink-primary">Health Sync</span>
        <nav className="flex gap-4 text-sm text-ink-secondary">
          <Link href="/" className="hover:text-ink-primary">
            Overview
          </Link>
          <Link href="/coach" className="hover:text-ink-primary">
            Coach
          </Link>
        </nav>
      </div>
    </header>
  );
}
