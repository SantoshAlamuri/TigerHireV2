"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";
import { ROLE_DASHBOARD_PATH } from "@/types/database";
import { resolveDashboardRouteAccessRule } from "@/lib/security/dashboard-route-policy";
import type { JobApplicantCounts } from "@/lib/v2/ta-portfolio";
import { buildQueue, type QueueEntry } from "@/lib/work/queue";

interface PortfolioJob {
  id: string;
  title: string;
  rubricApproved: boolean;
  counts: JobApplicantCounts;
}

interface PendingRequest {
  id: string;
  title: string;
  status: string;
}

/** The shared queue, so any screen can offer "next job" when the current one is clear. */
export function useWorkQueue() {
  const portfolio = useApiQuery<{ jobs: PortfolioJob[] }>("/api/portfolio");
  const drafts = useApiQuery<{ jobs: { id: string; title: string }[] }>("/api/jobs", {
    status: "draft",
    limit: 50,
  });
  const requests = useApiQuery<{ requests: PendingRequest[] }>("/api/hiring-requests", {
    status: "pending",
    limit: 50,
  });
  const queue = useMemo(
    () =>
      buildQueue([
        ...(portfolio.data?.jobs ?? []).map((j) => ({
          id: j.id,
          title: j.title,
          status: "open" as const,
          rubricApproved: j.rubricApproved,
          counts: j.counts,
        })),
        ...(drafts.data?.jobs ?? []).map((j) => ({
          id: j.id,
          title: j.title,
          status: "draft" as const,
          rubricApproved: false,
          counts: null,
        })),
      ]),
    [portfolio.data, drafts.data],
  );
  return {
    queue,
    waiting: requests.data?.requests ?? [],
    loading: portfolio.loading && !portfolio.data,
    error: portfolio.error,
    refresh: async () => {
      await Promise.all([
        portfolio.refetch({ silent: true }),
        drafts.refetch({ silent: true }),
        requests.refetch({ silent: true }),
      ]);
    },
  };
}

function QueueList({ entries, activeId }: { entries: QueueEntry[]; activeId: string | null }) {
  return (
    <ul className="wd-qlist">
      {entries.map((e) => (
        <li key={e.id}>
          <Link
            href={`/work/jobs/${e.id}`}
            className="wd-qitem"
            aria-current={activeId === e.id ? "page" : undefined}
          >
            <span className={`wd-qdot ${e.tone}`} aria-hidden="true" />
            <span style={{ minWidth: 0 }}>
              <span className="wd-qtitle">{e.title}</span>
              <span className="wd-qsub">{e.line}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const activeId = pathname.match(/^\/work\/jobs\/([^/]+)/)?.[1] ?? null;
  const { user } = useAuth();
  const { queue, waiting, loading, error } = useWorkQueue();

  return (
    <aside className="wd-side" aria-label="Your work">
      <div>
        <Link href="/work" className="wd-brand">
          tigerhire
          <i aria-hidden="true" />
        </Link>
        <div className="wd-org">{user?.organisationName ?? "Your work"}</div>
      </div>

      <Link href="/work/new" className="wd-btn go" style={{ minHeight: 42 }}>
        New job
      </Link>

      <section aria-label="Needs you">
        <div className="wd-qhead">
          <span>Needs you</span>
          <span>{loading ? "" : queue.needsYou.length}</span>
        </div>
        {loading ? (
          <p className="wd-qsub">Loading your work…</p>
        ) : error ? (
          <p className="wd-qsub" role="alert">
            Could not load your jobs. Reload to try again.
          </p>
        ) : queue.needsYou.length ? (
          <QueueList entries={queue.needsYou} activeId={activeId} />
        ) : (
          <p className="wd-qsub">Nothing is waiting on you.</p>
        )}
      </section>

      {waiting.length > 0 && (
        <section aria-label="Waiting on others">
          <div className="wd-qhead">
            <span>Waiting on others</span>
            <span>{waiting.length}</span>
          </div>
          <ul className="wd-qlist">
            {waiting.map((r) => (
              <li key={r.id}>
                <Link href={`/work/new?request=${r.id}`} className="wd-qitem">
                  <span className="wd-qdot" aria-hidden="true" />
                  <span style={{ minWidth: 0 }}>
                    <span className="wd-qtitle">{r.title}</span>
                    <span className="wd-qsub">Waiting for approval</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {queue.moving.length > 0 && (
        <section aria-label="In motion">
          <div className="wd-qhead">
            <span>In motion</span>
            <span>{queue.moving.length}</span>
          </div>
          <QueueList entries={queue.moving} activeId={activeId} />
        </section>
      )}

      <nav
        aria-label="More"
        style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 2 }}
      >
        <Link
          href="/work/setup"
          className="wd-qitem"
          aria-current={pathname.startsWith("/work/setup") ? "page" : undefined}
        >
          <span aria-hidden="true" />
          <span className="wd-qtitle">Setup</span>
        </Link>
        <Link href="/recruit/jobs" className="wd-qitem">
          <span aria-hidden="true" />
          <span className="wd-qtitle wd-muted">Classic view</span>
        </Link>
      </nav>
    </aside>
  );
}

/**
 * The work-driven shell: your queue on the left, the work item on the right.
 * No menus — the work decides which screen you see. Setup sits in one place.
 */
export function WorkShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const rule = resolveDashboardRouteAccessRule(pathname);
  const allowed = !!user && (!rule || rule.roles.includes(user.role));

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!allowed) router.replace(ROLE_DASHBOARD_PATH[user.role]);
  }, [loading, user, allowed, router]);

  return (
    <div className="wd">
      {!allowed ? (
        <p role="status" className="wd-muted" style={{ padding: 32 }}>
          Opening your work…
        </p>
      ) : (
        <div className="wd-shell">
          <Sidebar />
          <main className="wd-main" id="main">
            {children}
          </main>
        </div>
      )}
    </div>
  );
}
