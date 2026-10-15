"use client";

interface AuditEntry {
  id: string;
  event_type: string;
  resource_type: string | null;
  resource_id: string | null;
  actor_email: string | null;
  created_at: string;
}

export function AuditLogTable({
  entries,
  onLoadMore,
}: {
  entries: AuditEntry[];
  onLoadMore: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
        <table className="min-w-full divide-y divide-[var(--border)] text-sm">
          <thead className="bg-[var(--bg-elevated)]">
            <tr>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-[var(--text-subtle)]">
                Event
              </th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-[var(--text-subtle)]">
                Resource
              </th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-[var(--text-subtle)]">
                Actor
              </th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-[var(--text-subtle)]">
                Time
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="px-4 py-3 text-[var(--text)]">{entry.event_type}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">
                  {entry.resource_type || "—"} {entry.resource_id ? `(${entry.resource_id})` : ""}
                </td>
                <td className="px-4 py-3 text-[var(--text-muted)]">
                  {entry.actor_email || "System"}
                </td>
                <td className="px-4 py-3 text-[var(--text-subtle)]">
                  {new Date(entry.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[var(--text-muted)]">
                  No audit events yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={onLoadMore}
        className="rounded-full border border-[var(--border)] px-4 py-2 text-xs text-[var(--text-muted)]"
      >
        Load more
      </button>
    </div>
  );
}
