export function StatCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
      <div className="text-sm text-ink-secondary">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-ink-primary">{value}</div>
      {sublabel && <div className="mt-1 text-xs text-ink-muted">{sublabel}</div>}
    </div>
  );
}
