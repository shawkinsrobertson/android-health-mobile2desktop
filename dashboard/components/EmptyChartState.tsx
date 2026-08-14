export function EmptyChartState({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-ink-muted">
      {label}
    </div>
  );
}
