import Link from "next/link";

export interface BulletinActivityItem {
  clientId: string;
  clientName: string;
  completedAt: string;
}

export interface BulletinMessageItem {
  clientId: string;
  clientName: string;
}

export interface BulletinEventItem {
  id: string;
  title: string;
  startTime: string;
}

// Read-only digest -- every item here is sourced from data the dashboard
// page already fetches elsewhere (recent workout completions, unread
// coach threads, today's calendar events), not a new query/table of its
// own. TaskList is what turns a bulletin item into something actionable.
export function DailyBulletin({
  recentActivity,
  unreadMessages,
  todayEvents,
}: {
  recentActivity: BulletinActivityItem[];
  unreadMessages: BulletinMessageItem[];
  todayEvents: BulletinEventItem[];
}) {
  const hasAnything = recentActivity.length > 0 || unreadMessages.length > 0 || todayEvents.length > 0;

  return (
    <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-ink-primary">Daily bulletin</h2>
      {!hasAnything ? (
        <p className="text-sm text-ink-muted">Nothing new since last time.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
              Recent activity
            </h3>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-ink-muted">Nothing recent.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {recentActivity.map((item) => (
                  <li key={`${item.clientId}-${item.completedAt}`} className="text-sm">
                    <Link href={`/dashboard/clients/${item.clientId}`} className="text-ink-primary hover:underline">
                      {item.clientName}
                    </Link>
                    <span className="text-ink-muted"> finished a workout</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
              Unread messages
            </h3>
            {unreadMessages.length === 0 ? (
              <p className="text-sm text-ink-muted">All caught up.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {unreadMessages.map((item) => (
                  <li key={item.clientId} className="text-sm">
                    <Link href={`/dashboard/clients/${item.clientId}/chat`} className="text-ink-primary hover:underline">
                      {item.clientName}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
              Today
            </h3>
            {todayEvents.length === 0 ? (
              <p className="text-sm text-ink-muted">Nothing on the calendar today.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {todayEvents.map((event) => (
                  <li key={event.id} className="text-sm text-ink-primary">
                    {event.title}
                    <span className="text-ink-muted">
                      {" "}
                      at {new Date(event.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
