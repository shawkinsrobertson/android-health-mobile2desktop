// Plain server-action form, no client-side state -- consistent with the
// rest of this app's assign forms (see the client page's own AssignForm).
export function AssignToClientCard({
  itemId,
  action,
  clients,
  itemLabel,
}: {
  itemId: string;
  action: (itemId: string, formData: FormData) => Promise<void>;
  clients: { id: string; name: string }[];
  itemLabel: string;
}) {
  const boundAction = action.bind(null, itemId);

  return (
    <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold text-ink-primary">Assign to client</h2>
      {clients.length === 0 ? (
        <p className="text-sm text-ink-muted">No clients yet to assign this {itemLabel} to.</p>
      ) : (
        <form action={boundAction} className="flex items-center gap-2">
          <select
            name="client_id"
            required
            className="flex-1 rounded-lg border border-[color:var(--border-hairline)] bg-[color:var(--page-plane)] px-3 py-1.5 text-sm text-ink-primary"
          >
            <option value="">Choose a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
          >
            Assign
          </button>
        </form>
      )}
    </section>
  );
}
