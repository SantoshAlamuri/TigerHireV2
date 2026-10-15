"use client";

import { Bot, CreditCard, FileText, Star, Unlock, UserCheck, UserPlus } from "lucide-react";
import type { ActivityEvent } from "@/types";

interface ActivityFeedProps {
  events: ActivityEvent[];
  limit?: number;
}

const EVENT_ICONS: Record<ActivityEvent["type"], React.ComponentType<{ size?: number }>> = {
  candidate_detected: UserPlus,
  fitscore_ready: Star,
  job_posted: FileText,
  profile_claimed: UserCheck,
  unlock: Unlock,
  agent_completed: Bot,
  payment: CreditCard,
};

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "1d ago";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

export default function ActivityFeed({ events, limit }: ActivityFeedProps) {
  const displayEvents = limit ? events.slice(0, limit) : events;

  return (
    <div className="relative">
      <div className="absolute left-[11px] top-2 bottom-2 w-px bg-[var(--border)]" aria-hidden />
      <ul className="space-y-0">
        {displayEvents.map((event, index) => {
          const Icon = EVENT_ICONS[event.type];
          return (
            <li key={event.id} className="relative flex gap-4 pl-10 pb-6 last:pb-0">
              <div className="absolute left-0 top-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)]">
                <Icon size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="heading-card text-sm text-[var(--text)]">{event.title}</p>
                <p className="text-body mt-0.5 text-xs text-[var(--text-muted)]">
                  {event.description}
                </p>
                <p className="text-body mt-1 text-xs text-[var(--text-subtle)]">
                  {formatRelativeTime(event.timestamp)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
