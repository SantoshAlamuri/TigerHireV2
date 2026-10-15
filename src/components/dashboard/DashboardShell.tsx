"use client";

import { useState, useMemo, useEffect, useSyncExternalStore, startTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopNavigation } from "./TopNavigation";
import { CompanySetupWelcomeBanner } from "./CompanySetupWelcomeBanner";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";
import { ROLE_DASHBOARD_PATH } from "@/types/database";
import type { UserRole } from "@/types/database";
import {
  matchesDashboardPrefix,
  resolveDashboardRouteAccessRule,
  shouldRedirectNonOrgAdminFromOrgConfigPath,
} from "@/lib/security/dashboard-route-policy";
import { COMPANY_PENDING_ACTIVATION_PATH } from "@/lib/security/company-org-activation-guards";

interface DashboardShellProps {
  children: React.ReactNode;
}

const DASHBOARD_CAPABILITY_CACHE_MS = 30 * 60_000;

export function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /** False during SSR / server snapshot; true on client after hydration (avoids setState-in-effect). */
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const { user, loading } = useAuth();
  const [initialLoad, setInitialLoad] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  const financeEnterpriseGate =
    !!user &&
    pathname.startsWith("/company/finance") &&
    (user.role === "recruiter" || user.role === "hiring_manager");

  const { data: enterpriseCap, loading: financeCapLoading } = useApiQuery<{ finance?: boolean }>(
    financeEnterpriseGate ? "/api/me/enterprise-capabilities" : null,
    undefined,
    { cacheTtlMs: DASHBOARD_CAPABILITY_CACHE_MS, persistToSessionStorage: true },
  );

  // Defer state update so it is not synchronous inside the effect (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!loading && user) {
      startTransition(() => {
        setInitialLoad(false);
      });
    }
  }, [loading, user]);

  const authorized = useMemo(() => {
    if (!mounted) return false; // not mounted yet, show spinner
    if (loading && initialLoad) return false; // still doing initial auth load
    if (!user) return false; // no user after loading = unauthorized
    if (financeEnterpriseGate) {
      if (financeCapLoading) return false;
      return enterpriseCap?.finance === true;
    }
    if (shouldRedirectNonOrgAdminFromOrgConfigPath(pathname, Boolean(user.isOrgAdmin), user.role)) {
      return false;
    }
    const rule = resolveDashboardRouteAccessRule(pathname);
    if (rule && !rule.roles.includes(user.role)) return false;
    return true;
  }, [
    user,
    loading,
    pathname,
    mounted,
    initialLoad,
    financeEnterpriseGate,
    financeCapLoading,
    enterpriseCap?.finance,
  ]);

  const showRedirectingState =
    mounted &&
    !loading &&
    !!user &&
    !authorized &&
    (financeCapLoading === false || financeEnterpriseGate === false);

  useEffect(() => {
    if (loading) return; // wait for auth to finish loading
    if (!user) {
      // No session — redirect to login
      router.replace("/login");
      return;
    }
    if (financeEnterpriseGate) {
      if (financeCapLoading) return;
      if (!enterpriseCap?.finance) {
        router.replace(ROLE_DASHBOARD_PATH[user.role]);
      }
      return;
    }
    if (shouldRedirectNonOrgAdminFromOrgConfigPath(pathname, Boolean(user.isOrgAdmin), user.role)) {
      router.replace(ROLE_DASHBOARD_PATH[user.role]);
      return;
    }
    const rule = resolveDashboardRouteAccessRule(pathname);
    if (rule && !rule.roles.includes(user.role)) {
      router.replace(ROLE_DASHBOARD_PATH[user.role]);
    }
  }, [
    loading,
    user,
    pathname,
    router,
    financeEnterpriseGate,
    financeCapLoading,
    enterpriseCap?.finance,
  ]);

  // Lock body scroll when mobile sidebar is open so the drawer is usable
  useEffect(() => {
    if (!sidebarOpen) return;
    const isMobile =
      typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  if (showRedirectingState) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
          <p className="text-sm font-semibold text-[var(--text)]">You do not have access here.</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Redirecting you to the right dashboard.
          </p>
        </div>
      </div>
    );
  }

  // Show loading spinner during initial mount/auth load, finance capability check, or missing session
  if (!mounted || (initialLoad && loading) || (!loading && !user) || !authorized) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="relative flex h-screen min-h-0 overflow-hidden bg-[var(--bg)]">
      {/* Solid 1px hairline — inset shadows can look uneven next to the ambient gradient */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[65] h-px bg-[rgba(245,158,11,0.22)]"
        aria-hidden
      />
      <a
        href="#main-content"
        className="focus-ring absolute left-4 top-0 z-[300] -translate-y-[calc(100%+1rem)] rounded-[var(--radius-sm)] bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-black shadow-lg transition-transform duration-200 focus:translate-y-4"
      >
        Skip to main content
      </a>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TopNavigation onMenuClick={() => setSidebarOpen(true)} />
        <main
          id="main-content"
          tabIndex={-1}
          className={`dashboard-main alive-air ${/^\/(company|recruit)(\/|$)/.test(pathname) && !pathname.includes("referral") ? "hiring-workspace" : ""} mx-auto w-full max-w-[1500px] flex-1 scroll-mt-4 overflow-y-auto px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]/35 sm:px-5 sm:py-5 lg:px-6 lg:py-5`}
        >
          {user?.role === "leadership" &&
          pathname.startsWith("/company") &&
          !matchesDashboardPrefix(pathname, COMPANY_PENDING_ACTIVATION_PATH) ? (
            <CompanySetupWelcomeBanner userId={user.id} />
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
