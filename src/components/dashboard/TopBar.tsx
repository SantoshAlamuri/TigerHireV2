"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, UserCircle, LogOut, LifeBuoy, ClipboardList } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { NotificationDropdown } from "./NotificationDropdown";
import { SupportRequestDialog } from "./SupportRequestDialog";

interface TopBarProps {
  onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { user, logout } = useAuth();
  const [supportOpen, setSupportOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)]/80 bg-[var(--bg)]/92 pt-[env(safe-area-inset-top)] backdrop-blur-lg">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-5 lg:px-6">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="-ml-1.5 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 lg:hidden"
        >
          <Menu size={24} />
        </button>

        <div className="flex-1" />

        <div className="shrink-0">
          <NotificationDropdown />
        </div>

        {user ? (
          <div className="flex items-center gap-1.5">
            {user.role !== "super_admin" ? (
              <>
                <Link
                  href="/support-requests"
                  title="Track support requests"
                  aria-label="Track support requests"
                  className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 text-[var(--text)] transition hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                >
                  <ClipboardList size={18} />
                </Link>
                <button
                  type="button"
                  onClick={() => setSupportOpen(true)}
                  title="Raise support request"
                  aria-label="Raise support request"
                  className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 text-[var(--text)] transition hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                >
                  <LifeBuoy size={18} />
                </button>
              </>
            ) : null}
            <Link
              href="/profile"
              title="Your profile"
              aria-label="Your profile"
              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 text-[var(--text)] transition hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            >
              <UserCircle size={18} aria-hidden />
              <span className="sr-only">Your profile</span>
            </Link>
            <button
              type="button"
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 text-red-300 transition hover:bg-red-500/10 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            >
              <LogOut size={18} />
            </button>
          </div>
        ) : null}
      </div>
      <SupportRequestDialog open={supportOpen} onClose={() => setSupportOpen(false)} />
    </header>
  );
}
