"use client";

import { useState } from "react";
import { MessageSquare, Loader2, Pencil, Trash2, Send } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";

type NoteRow = {
  id: number | string;
  candidate_id: string;
  job_id: string | null;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  profiles?: { name: string | null } | null;
};

interface CandidateNotesSectionProps {
  candidateId: string;
  /** Optional: filter notes by job */
  jobId?: string | null;
}

function formatNoteDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CandidateNotesSection({ candidateId, jobId }: CandidateNotesSectionProps) {
  const { user } = useAuth();
  const [newBody, setNewBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, refetch } = useApiQuery<{ notes: NoteRow[] }>(
    candidateId ? `/api/candidates/${candidateId}/notes` : null,
    jobId ? { job_id: jobId } : undefined,
  );

  const notes = data?.notes ?? [];

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const body = newBody.trim();
    if (!body || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, ...(jobId && { jobId }) }),
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((json as { error?: string }).error ?? "Failed to add note");
        return;
      }
      setNewBody("");
      await refetch();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(noteId: string, body: string) {
    if (!body.trim()) return;
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId, body: body.trim() }),
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((json as { error?: string }).error ?? "Failed to update note");
        return;
      }
      setEditingId(null);
      setEditBody("");
      await refetch();
    } catch {
      setError("Failed to update note");
    }
  }

  async function handleDelete(noteId: string) {
    setDeletingId(noteId);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId }),
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((json as { error?: string }).error ?? "Failed to delete note");
        return;
      }
      await refetch();
    } catch {
      setError("Failed to delete note");
    } finally {
      setDeletingId(null);
    }
  }

  const authorName = (note: NoteRow) =>
    note.profiles && typeof note.profiles === "object" && "name" in note.profiles
      ? ((note.profiles as { name: string | null }).name ?? "Unknown")
      : "Unknown";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-5 backdrop-blur-sm">
      <h3 className="heading-card mb-4 flex items-center gap-2 text-sm text-[var(--text)]">
        <MessageSquare size={18} className="text-[var(--accent)]" />
        Notes
      </h3>
      {error && (
        <p className="mb-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}
      <form onSubmit={handleAdd} className="mb-4">
        <textarea
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="Add a note (mention teammates with @name)..."
          rows={2}
          maxLength={5000}
          className="text-body w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
        />
        <p className="mt-1 text-xs text-[var(--text-subtle)]">
          Mentions notify teammates in your organisation (example:{" "}
          <span className="font-mono">@anita.k</span>).
        </p>
        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            disabled={!newBody.trim() || submitting}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Add note
          </button>
        </div>
      </form>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-body py-4 text-sm text-[var(--text-muted)]">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => {
            const noteIdStr = String(note.id);
            const isAuthor = user?.id === note.author_id;
            const isEditing = editingId === noteIdStr;
            return (
              <li
                key={noteIdStr}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3"
              >
                {isEditing ? (
                  <div>
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={2}
                      maxLength={5000}
                      className="text-body mb-2 w-full resize-y rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdate(noteIdStr, editBody)}
                        className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-medium text-black"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditBody("");
                        }}
                        className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-body whitespace-pre-wrap text-sm text-[var(--text)]">
                      {note.body}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-[var(--text-muted)]">
                        {authorName(note)} · {formatNoteDate(note.created_at)}
                      </span>
                      {isAuthor && (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(noteIdStr);
                              setEditBody(note.body);
                            }}
                            className="rounded p-1 text-[var(--text-muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]"
                            aria-label="Edit note"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              confirm("Delete this note?") ? handleDelete(noteIdStr) : null
                            }
                            disabled={deletingId === noteIdStr}
                            className="rounded p-1 text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label="Delete note"
                          >
                            {deletingId === noteIdStr ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
