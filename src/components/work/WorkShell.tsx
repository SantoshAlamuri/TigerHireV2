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
import type { ApprovalTaskItem } from "@/lib/approvals/task-types";
import { cardsFromApprovals } from "@/lib/work/hm";
import { isOnboardingEntry, needsOnboarding, onboardingKind } from "@/lib/work/onboarding";
import { useOnboardingHints } from "@/components/work/use-onboarding";
import { Brand } from "@/components/work/Brand";
import { SideFrame } from "@/components/work/SideFrame";

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
  const onboarding = useOnboardingHints();
  const setupOpen =
    !!user &&
    onboardingKind(user.role, Boolean(user.isOrgAdmin)) === "admin" &&
    onboarding.ready &&
    needsOnboarding("admin", onboarding.hints);

  const approvals = useApiQuery<{ items: ApprovalTaskItem[] }>("/api/approvals");
  const decisions = cardsFromApprovals(approvals.data?.items ?? []).length;
  const needCount = queue.needsYou.length + (setupOpen ? 1 : 0) + (decisions ? 1 : 0);

  const rail = (
    <>
      <Brand href="/work" compact />
      <Link href="/work/new" className="wd-rail-btn go" aria-label="New job" title="New job">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </Link>
      <Link
        href="/work"
        className="wd-rail-btn"
        aria-label={loading ? "Your work" : `${needCount} need you`}
        aria-current={pathname === "/work" ? "page" : undefined}
        title="Needs you"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        {!loading && needCount > 0 && <span className="wd-rail-count">{needCount}</span>}
      </Link>
      <Link
        href="/work/interviews"
        className="wd-rail-btn"
        aria-label="Interviews"
        title="Interviews"
        aria-current={pathname.startsWith("/work/interviews") ? "page" : undefined}
      >
        <Icon d={ICONS.calendar} />
      </Link>
      <Link
        href="/work/reports"
        className="wd-rail-btn"
        aria-label="Reports"
        aria-current={pathname.startsWith("/work/reports") ? "page" : undefined}
        title="Reports"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            d="M3 13V8M8 13V3M13 13v-7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </Link>
      <Link
        href="/work/setup"
        className="wd-rail-btn"
        style={{ marginTop: "auto" }}
        aria-label="Setup"
        aria-current={pathname.startsWith("/work/setup") ? "page" : undefined}
        title="Setup"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            d="M3 4.5h6M12 4.5h1M3 11.5h1M7 11.5h6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="10.5" cy="4.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="5.5" cy="11.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </Link>
    </>
  );

  return (
    <SideFrame rail={rail} label="Your work">
      <div>
        <Brand href="/work" />
        <div className="wd-org">{user?.organisationName ?? "Your work"}</div>
      </div>

      <Link href="/work/new" className="wd-btn go" style={{ minHeight: 42 }}>
        New job
      </Link>

      <section aria-label="Needs you">
        <div className="wd-qhead">
          <span>Needs you</span>
          <span>{loading ? "" : needCount}</span>
        </div>
        {loading ? (
          <p className="wd-qsub">Loading your work…</p>
        ) : error ? (
          <p className="wd-qsub" role="alert">
            Could not load your jobs. Reload to try again.
          </p>
        ) : queue.needsYou.length || setupOpen || decisions ? (
          <>
            {decisions > 0 && (
              <ul className="wd-qlist">
                <li>
                  <Link
                    href="/work/decisions"
                    className="wd-qitem"
                    aria-current={pathname.startsWith("/work/decisions") ? "page" : undefined}
                  >
                    <span className="wd-qdot you" aria-hidden="true" />
                    <span style={{ minWidth: 0 }}>
                      <span className="wd-qtitle">
                        {decisions === 1 ? "1 decision" : `${decisions} decisions`} waiting
                      </span>
                      <span className="wd-qsub">Roles and shortlists to approve</span>
                    </span>
                  </Link>
                </li>
              </ul>
            )}
            {setupOpen && (
              <ul className="wd-qlist">
                <li>
                  <Link
                    href="/work/welcome"
                    className="wd-qitem"
                    aria-current={pathname.startsWith("/work/welcome") ? "page" : undefined}
                  >
                    <span className="wd-qdot you" aria-hidden="true" />
                    <span style={{ minWidth: 0 }}>
                      <span className="wd-qtitle">Set up your team</span>
                      <span className="wd-qsub">A few minutes, once</span>
                    </span>
                  </Link>
                </li>
              </ul>
            )}
            <QueueList entries={queue.needsYou} activeId={activeId} />
          </>
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
          href="/work/interviews"
          className="wd-qitem"
          aria-current={pathname.startsWith("/work/interviews") ? "page" : undefined}
        >
          <span aria-hidden="true" />
          <span className="wd-qtitle">Interviews</span>
        </Link>
        <Link
          href="/work/reports"
          className="wd-qitem"
          aria-current={pathname.startsWith("/work/reports") ? "page" : undefined}
        >
          <span aria-hidden="true" />
          <span className="wd-qtitle">Reports</span>
        </Link>
        <Link
          href="/work/setup"
          className="wd-qitem"
          aria-current={pathname.startsWith("/work/setup") ? "page" : undefined}
        >
          <span aria-hidden="true" />
          <span className="wd-qtitle">Setup</span>
        </Link>
      </nav>
    </SideFrame>
  );
}

/**
 * The work-driven shell: your queue on the left, the work item on the right.
 * No menus — the work decides which screen you see. Setup sits in one place.
 */
/** Where each role's work starts in the new view. */
export const WORK_HOME: Partial<Record<string, string>> = {
  hiring_manager: "/work/hm",
  interviewer: "/work/interviews",
  finance: "/work/decisions",
};

const ICONS = {
  check: "M3 8.5l3 3 7-7",
  calendar:
    "M3 5.5h10M5 2.5v2M11 2.5v2M3.5 4h9a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-8a.5.5 0 0 1 .5-.5z",
  chart: "M3 13V8M8 13V3M13 13v-7",
  person: "M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 13.5c.6-2.3 2.6-3.5 5-3.5s4.4 1.2 5 3.5",
};

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Hiring managers, interviewers and finance get no queue: their page is the
 * queue. The panel just lists the few places that are theirs.
 */
function LiteSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.role;
  const home = (role && WORK_HOME[role]) ?? "/work/hm";
  const links: { href: string; name: string; icon: keyof typeof ICONS }[] = [
    ...(role === "hiring_manager"
      ? [
          { href: "/work/hm", name: "Your decisions", icon: "check" as const },
          { href: "/work/interviews", name: "Interviews", icon: "calendar" as const },
          { href: "/work/reports", name: "Reports", icon: "chart" as const },
        ]
      : role === "interviewer"
        ? [{ href: "/work/interviews", name: "Your interviews", icon: "calendar" as const }]
        : [{ href: "/work/decisions", name: "Decisions", icon: "check" as const }]),
    { href: "/work/setup/profile", name: "You", icon: "person" },
  ];
  const rail = (
    <>
      <Brand href={home} compact />
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="wd-rail-btn"
          aria-label={l.name}
          title={l.name}
          aria-current={pathname.startsWith(l.href) ? "page" : undefined}
          style={l.icon === "person" ? { marginTop: "auto" } : undefined}
        >
          <Icon d={ICONS[l.icon]} />
        </Link>
      ))}
    </>
  );
  return (
    <SideFrame rail={rail} label="Your work">
      <div>
        <Brand href={home} />
        <div className="wd-org">{user?.organisationName ?? "Your work"}</div>
      </div>
      <nav aria-label="Your work" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="wd-qitem"
            aria-current={pathname.startsWith(l.href) ? "page" : undefined}
          >
            <span aria-hidden="true" />
            <span className="wd-qtitle">{l.name}</span>
          </Link>
        ))}
      </nav>
    </SideFrame>
  );
}

export function WorkShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const rule = resolveDashboardRouteAccessRule(pathname);
  const allowed = !!user && (!rule || rule.roles.includes(user.role));

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!allowed) router.replace(WORK_HOME[user.role] ?? ROLE_DASHBOARD_PATH[user.role]);
  }, [loading, user, allowed, router]);

  // First visit: the home screen hands over to onboarding until it is finished or skipped.
  const onboarding = useOnboardingHints();
  const kind = user ? onboardingKind(user.role, Boolean(user.isOrgAdmin)) : null;
  const sendToWelcome =
    allowed &&
    !!kind &&
    onboarding.ready &&
    isOnboardingEntry(pathname) &&
    needsOnboarding(kind, onboarding.hints);
  useEffect(() => {
    if (sendToWelcome) router.replace("/work/welcome");
  }, [sendToWelcome, router]);
  // Hold the home screen until we know, so it doesn't flash before onboarding.
  const holding = !!kind && isOnboardingEntry(pathname) && onboarding.loading;

  return (
    <div className="wd">
      {!allowed || sendToWelcome || holding ? (
        <p role="status" className="wd-muted" style={{ padding: 32 }}>
          Opening your work…
        </p>
      ) : (
        <div className="wd-shell">
          {user && WORK_HOME[user.role] ? <LiteSidebar /> : <Sidebar />}
          <main className="wd-main" id="main">
            {children}
          </main>
        </div>
      )}
    </div>
  );
}
