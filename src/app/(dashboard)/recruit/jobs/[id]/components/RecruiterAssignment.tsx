"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";

export function RecruiterAssignment({
  jobId,
  currentRecruiterId,
  onAssigned,
}: {
  jobId: string;
  currentRecruiterId: string | null;
  onAssigned: () => void;
}) {
  const [selected, setSelected] = useState(currentRecruiterId ?? "");
  const [saving, setSaving] = useState(false);
  const { data: membersData } = useApiQuery<{
    members: { id: string; full_name: string | null; role: string }[];
  }>("/api/organisations/members");

  const recruiters = (membersData?.members ?? []).filter((m) =>
    ["recruiter", "leadership", "agency"].includes(m.role),
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedRecruiterId: selected || null,
        }),
        credentials: "include",
      });
      if (res.ok) await onAssigned();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Users size={16} className="shrink-0 text-[var(--accent)]" />
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        aria-label="Assign recruiter"
        className="min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm text-[var(--text)] focus:border-white/20 focus:outline-none"
      >
        <option value="">Unassigned</option>
        {recruiters.map((r) => (
          <option key={r.id} value={r.id}>
            {r.full_name || r.id.slice(0, 8)}
          </option>
        ))}
      </select>
      {selected !== (currentRecruiterId ?? "") && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      )}
    </div>
  );
}
