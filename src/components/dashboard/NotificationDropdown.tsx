"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Bell, Check, ExternalLink, Loader2 } from "lucide-react";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

const POLL_INTERVAL = 30_000;
const REFRESH_STALE_MS = 15_000;

/** Full notifications page already loads the list; skip background polls to avoid duplicate traffic. */
function isNotificationsPagePath(pathname: string | null): boolean {
  return pathname === "/notifications" || pathname?.startsWith("/notifications/") === true;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function NotificationDropdown() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const lastFetchedAtRef = useRef(0);
  const routerReadyRef = useRef(false);

  useEffect(() => {
    routerReadyRef.current = true;
    return () => {
      routerReadyRef.current = false;
    };
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20", {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
      lastFetchedAtRef.current = Date.now();
    } catch {
      /* ERR_NETWORK_ACCESS_DENIED often from extensions or restricted context; fail silently */
    }
  }, []);

  useEffect(() => {
    void fetchNotifications();
    const interval = setInterval(() => {
      if (document.hidden) return;
      if (isNotificationsPagePath(pathname)) return;
      void fetchNotifications();
    }, POLL_INTERVAL);

    function handleVisibilityChange() {
      if (document.hidden) return;
      if (isNotificationsPagePath(pathname)) return;
      void fetchNotifications();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchNotifications, pathname]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleOpen() {
    setOpen(!open);
    if (!open) {
      const isStale = Date.now() - lastFetchedAtRef.current > REFRESH_STALE_MS;
      if (notifications.length === 0 || isStale) {
        setLoading(true);
        await fetchNotifications();
        setLoading(false);
      }
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      const base = "";
      await fetch(`${base}/api/notifications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
        credentials: "include",
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      /* silent */
    } finally {
      setMarkingAll(false);
    }
  }

  function handleNotificationClick(notif: Notification) {
    if (!notif.read) {
      const base = "";
      fetch(`${base}/api/notifications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [notif.id] }),
        credentials: "include",
      })
        .then((res) => {
          if (res.ok) {
            setNotifications((prev) =>
              prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
            );
            setUnreadCount((c) => Math.max(0, c - 1));
          }
        })
        // Deliberate no-op: the optimistic count stands on a network error
        // rather than flickering back. Returns null to state that explicitly.
        .catch(() => null);
    }
    if (notif.link) {
      queueMicrotask(() => {
        if (!routerReadyRef.current) return;
        router.push(notif.link!);
      });
      setOpen(false);
    }
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="relative rounded-md p-2 text-white/65 transition hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-black">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="card-lifted absolute right-0 top-full z-50 mt-2 w-80 sm:w-96">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <h3 className="heading-card text-sm text-[var(--text)]">Notifications</h3>
            <div className="flex items-center gap-2">
              <Link
                href="/notifications"
                className="text-xs font-medium text-white/65 transition hover:text-white"
                onClick={() => setOpen(false)}
              >
                View all
              </Link>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={markingAll}
                  className="flex items-center gap-1 text-xs font-medium text-[var(--accent)] transition hover:text-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {markingAll ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Check size={12} />
                  )}
                  Mark all read
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-white/45">
                No notifications yet
              </div>
            ) : (
              <ul>
                {notifications.map((notif) => (
                  <li key={notif.id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(notif)}
                      className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04] ${
                        !notif.read ? "bg-white/[0.03]" : ""
                      }`}
                    >
                      <div className="mt-1 flex-shrink-0">
                        {!notif.read && (
                          <span className="block h-2 w-2 rounded-full bg-[var(--accent)]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm ${!notif.read ? "font-bold text-white" : "text-white/65"}`}
                        >
                          {notif.title}
                        </p>
                        {notif.body && (
                          <p className="mt-0.5 truncate text-xs text-white/45">{notif.body}</p>
                        )}
                        <p className="mt-1 text-xs text-white/40" suppressHydrationWarning>
                          {timeAgo(notif.created_at)}
                        </p>
                      </div>
                      {notif.link && (
                        <ExternalLink size={14} className="mt-1 flex-shrink-0 text-white/35" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
