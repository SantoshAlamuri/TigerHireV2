"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { sectionCardClass, sectionTitleClass } from "@/lib/styles/form";

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={sectionCardClass}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown size={18} className="text-[var(--accent)]" />
        ) : (
          <ChevronRight size={18} className="text-[var(--text-muted)]" />
        )}
        <span className={sectionTitleClass}>{title}</span>
      </button>
      {open && <div className="space-y-4 pt-1">{children}</div>}
    </div>
  );
}
