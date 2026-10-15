"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Loader2, Bell, Check, ExternalLink, Mail, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import type { EmailPreferences } from "@/types";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

const EMAIL_PREF_LABELS: Record<keyof EmailPreferences, string> = {
  marketing: "Marketing and product updates",
  job_alerts: "Job alerts for saved searches",
  application_updates: "Application status updates",
  messages: "New message notifications",
  interview_reminders: "Interview reminders",
  weekly_digest: "Weekly digest",
};

const PAGE_SIZE = 20;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export default function NotificationsPage() {
  const { toast } = useToast();
  const [offset, setOffset] = useState(0);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data: prefsData, loading: prefsLoading } = useApiQuery<{
    preferences: EmailPreferences & Record<string, unknown>;
  }>("/api/email-preferences");

  const prefs = prefsData?.preferences;
  const [prefsState, setPrefsState] = useState<EmailPreferences>({
    marketing: false,
    job_alerts: false,
    application_updates: false,
    messages: false,
    interview_reminders: false,
    weekly_digest: false,
  });
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const deleteTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (prefs) {
      setPrefsState({
        marketing: !!prefs.marketing,
        job_alerts: !!prefs.job_alerts,
        application_updates: !!prefs.application_updates,
        messages: !!prefs.messages,
        interview_reminders: !!prefs.interview_reminders,
        weekly_digest: !!prefs.weekly_digest,
      });
    }
  }, [prefs]);

  const fetchPage = useCallback(async (off: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/notifications?limit=${PAGE_SIZE}&offset=${off}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      const list = data.notifications ?? [];
      setNotifications((prev) => (append ? [...prev, ...list] : list));
      setUnreadCount(data.unreadCount ?? 0);
      setHasMore(list.length === PAGE_SIZE);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(0, false);
  }, [fetchPage]);

  useEffect(() => {
    return () => {
      for (const timeoutId of deleteTimersRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      deleteTimersRef.current.clear();
    };
  }, []);

  const { mutate: markReadMutation } = useOptimisticMutation<{ updated: true }, { ids: string[] }>(
    "/api/notifications",
    {
      method: "PATCH",
      onMutate: ({ ids }) => {
        const previous = notifications;
        const prevUnread = unreadCount;
        setNotifications((prev) =>
          prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)),
        );
        setUnreadCount((prev) => Math.max(0, prev - ids.length));
        return () => {
          setNotifications(previous);
          setUnreadCount(prevUnread);
        };
      },
      onError: (err) => {
        toast({
          title: "Could not mark as read",
          description: err.message,
          tone: "error",
        });
      },
    },
  );

  async function markAllRead() {
    if (markingAll || unreadCount === 0) return;
    const previous = notifications;
    const previousUnread = unreadCount;
    setMarkingAll(true);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
        credentials: "include",
      });
      if (!res.ok) {
        setNotifications(previous);
        setUnreadCount(previousUnread);
        toast({
          title: "Could not update notifications",
          tone: "error",
        });
      }
    } catch {
      setNotifications(previous);
      setUnreadCount(previousUnread);
      toast({
        title: "Network issue",
        description: "Could not mark notifications as read.",
        tone: "error",
      });
    } finally {
      setMarkingAll(false);
    }
  }

  function handleMarkRead(id: string) {
    const target = notifications.find((n) => n.id === id);
    if (!target || target.read) return;
    void markReadMutation({ ids: [id] });
  }

  function handleDeleteWithUndo(id: string) {
    const snapshot = [...notifications];
    const index = snapshot.findIndex((n) => n.id === id);
    if (index === -1) return;
    const removed = snapshot[index];
    const next = snapshot.filter((n) => n.id !== id);
    setNotifications(next);
    if (!removed.read) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    const timeoutId = window.setTimeout(() => {
      deleteTimersRef.current.delete(id);
    }, 5000);
    deleteTimersRef.current.set(id, timeoutId);
    toast({
      title: "Notification deleted",
      description: "Undo within 5 seconds.",
      tone: "info",
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          const timer = deleteTimersRef.current.get(id);
          if (timer) {
            window.clearTimeout(timer);
            deleteTimersRef.current.delete(id);
          }
          setNotifications((prev) => {
            if (prev.some((n) => n.id === removed.id)) return prev;
            const restored = [...prev];
            restored.splice(Math.min(index, restored.length), 0, removed);
            return restored;
          });
          if (!removed.read) {
            setUnreadCount((prev) => prev + 1);
          }
        },
      },
    });
  }

  async function loadMore() {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    await fetchPage(next, true);
  }

  function togglePref(key: keyof EmailPreferences) {
    const next = { ...prefsState, [key]: !prefsState[key] };
    setPrefsState(next);
    setPrefsSaving(true);
    setPrefsSaved(false);
    fetch("/api/email-preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
      credentials: "include",
    })
      .then(() => {
        setPrefsSaved(true);
        setTimeout(() => setPrefsSaved(false), 2000);
      })
      .finally(() => setPrefsSaving(false));
  }

  return (
    <>
      <PageHeader title="Notifications" subtitle="Your activity and email preferences" />
      <div className="space-y-8">
        {/* Notifications list */}
        <section className="card-lifted border border-[var(--border)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <h2 className="heading-section flex items-center gap-2 text-base text-[var(--text)]">
              <Bell size={18} />
              Activity
            </h2>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                disabled={markingAll}
                className="flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] transition hover:text-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {markingAll ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Mark all read
              </button>
            )}
          </div>
          <div className="min-h-[200px]">
            {loading ? (
              <div className="space-y-2 px-4 py-4">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <Skeleton key={`notif-skel-${idx}`} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-white/60">
                No notifications yet
              </div>
            ) : (
              <ul>
                {notifications.map((notif) => (
                  <li key={notif.id} className="border-b border-[var(--border)] last:border-b-0">
                    {notif.link ? (
                      <Link
                        href={notif.link}
                        onClick={() => handleMarkRead(notif.id)}
                        className="flex gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04]"
                      >
                        <div className="mt-1.5 flex-shrink-0">
                          {!notif.read && (
                            <span className="block h-2 w-2 rounded-full bg-[var(--accent)]" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm ${!notif.read ? "font-semibold text-[var(--text)]" : "text-white/60"}`}
                          >
                            {notif.title}
                          </p>
                          {notif.body && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-white/60">
                              {notif.body}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-white/60" suppressHydrationWarning>
                            {timeAgo(notif.created_at)}
                          </p>
                        </div>
                        <div className="mt-1.5 flex flex-shrink-0 items-start gap-1.5">
                          {!notif.read ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                handleMarkRead(notif.id);
                              }}
                              className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-white/65 transition hover:text-white"
                            >
                              Mark read
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              handleDeleteWithUndo(notif.id);
                            }}
                            className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-white/65 transition hover:text-white"
                          >
                            Delete
                          </button>
                          <ExternalLink size={14} className="text-white/60" />
                        </div>
                      </Link>
                    ) : (
                      <div className="flex gap-3 px-4 py-3">
                        <div className="mt-1.5 flex-shrink-0">
                          {!notif.read && (
                            <span className="block h-2 w-2 rounded-full bg-[var(--accent)]" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm ${!notif.read ? "font-semibold text-[var(--text)]" : "text-white/60"}`}
                          >
                            {notif.title}
                          </p>
                          {notif.body && (
                            <p className="mt-0.5 text-xs text-white/60">{notif.body}</p>
                          )}
                          <p className="mt-1 text-xs text-white/60" suppressHydrationWarning>
                            {timeAgo(notif.created_at)}
                          </p>
                        </div>
                        <div className="mt-1.5 flex flex-shrink-0 items-start gap-1.5">
                          {!notif.read ? (
                            <button
                              type="button"
                              onClick={() => handleMarkRead(notif.id)}
                              className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-white/65 transition hover:text-white"
                            >
                              Mark read
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => handleDeleteWithUndo(notif.id)}
                            className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-white/65 transition hover:text-white"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!loading && hasMore && notifications.length > 0 && (
              <div className="border-t border-[var(--border)] px-4 py-3">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full rounded-md border border-white/10 bg-white/[0.04] py-2 text-sm font-medium text-white/90 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingMore ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Loading…
                    </span>
                  ) : (
                    "Load more"
                  )}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Email preferences */}
        <section className="card-lifted border border-[var(--border)] p-6">
          <h2 className="heading-section mb-4 flex items-center gap-2 text-base text-[var(--text)]">
            <Mail size={18} />
            Email preferences
          </h2>
          {prefsLoading ? (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 size={16} className="animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="space-y-3">
              {(Object.keys(EMAIL_PREF_LABELS) as (keyof EmailPreferences)[]).map((key) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-[var(--text)]">{EMAIL_PREF_LABELS[key]}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={(prefsState[key] ? "true" : "false") as "true" | "false"}
                    aria-label={`${EMAIL_PREF_LABELS[key]} ${prefsState[key] ? "on" : "off"}`}
                    onClick={() => togglePref(key)}
                    disabled={prefsSaving}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${prefsState[key] ? "bg-[var(--accent)]" : "bg-[var(--border-interactive)]"}`}
                  >
                    <span
                      className={`inline-block mt-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${prefsState[key] ? "translate-x-[22px]" : "translate-x-[2px]"}`}
                    />
                  </button>
                </div>
              ))}
              {prefsSaved && (
                <p className="flex items-center gap-1.5 text-sm text-emerald-400">
                  <CheckCircle2 size={14} />
                  Preferences saved
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
