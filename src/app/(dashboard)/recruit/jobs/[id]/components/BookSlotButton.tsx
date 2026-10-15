"use client";

import { useState } from "react";
import { Loader2, BookOpen } from "lucide-react";

export function BookSlotButton({
  jobId,
  slotId,
  pipelineCandidates,
  onBooked,
}: {
  jobId: string;
  slotId: string;
  pipelineCandidates: { id: string; candidates?: { name: string | null } }[];
  onBooked: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bookFor = async (pipelineCandidateId: string) => {
    setLoading(true);
    setMenuOpen(false);
    try {
      const res = await fetch(`/api/jobs/${jobId}/interviews/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot_id: slotId,
          pipeline_candidate_id: pipelineCandidateId,
        }),
        credentials: "include",
      });
      if (res.ok) await onBooked();
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-black hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <BookOpen size={12} />}
        Book
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-full z-10 mt-1 min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-xl">
          {pipelineCandidates.map((pc) => (
            <button
              key={pc.id}
              type="button"
              onClick={() => bookFor(pc.id)}
              className="flex w-full px-3 py-2 text-left text-xs text-[var(--text)] hover:bg-white/[0.04]"
            >
              {pc.candidates?.name ?? "Candidate"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
