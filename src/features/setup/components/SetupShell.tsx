"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  SETUP_AREAS,
  getSetupRouteByPath,
  getSetupRoutesForArea,
  type SetupArea,
} from "@/features/setup/config/manifest";
import { isSetupLandingPath } from "@/features/setup/navigation";
import { navHrefMatchesPathname } from "@/components/dashboard/navigation";

function resolveArea(pathname: string): SetupArea | null {
  if (isSetupLandingPath(pathname)) return null;
  const match = SETUP_AREAS.find((a) => pathname === a.href || pathname.startsWith(`${a.href}/`));
  return match?.id ?? null;
}

function routeChildActive(pathname: string, areaHref: string): boolean {
  return pathname !== areaHref && pathname.startsWith(`${areaHref}/`);
}

function SetupSectionNav({ area, pathname }: { area: SetupArea; pathname: string }) {
  const routes = getSetupRoutesForArea(area);
  const areaLabel = SETUP_AREAS.find((a) => a.id === area)?.label ?? area;
  if (routes.length === 0) return null;

  return (
    <nav className="mt-3 border-t border-[var(--border)]/60 pt-3" aria-label={`${areaLabel} pages`}>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/45">
        {areaLabel}
      </p>
      <ul className="flex gap-1 overflow-x-auto pb-0.5 lg:block lg:space-y-0.5 lg:overflow-visible lg:pb-0">
        {routes.map((route) => {
          const active = pathname === route.path || navHrefMatchesPathname(pathname, route.path);
          return (
            <li key={route.id} className="shrink-0 lg:shrink">
              <Link
                href={route.path}
                className={`block whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40 lg:whitespace-normal ${
                  active
                    ? "bg-amber-500/15 font-medium text-amber-100"
                    : "text-white/65 hover:bg-white/[0.04] hover:text-white/90"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {route.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SetupBreadcrumb({ pathname, area }: { pathname: string; area: SetupArea | null }) {
  const route = getSetupRouteByPath(pathname);
  const areaMeta = area ? SETUP_AREAS.find((a) => a.id === area) : null;
  if (!areaMeta && !route) return null;

  return (
    <nav
      aria-label="Setup location"
      className="hidden min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-white/50 sm:flex"
    >
      <Link href="/setup" className="hover:text-white/80">
        Setup
      </Link>
      {areaMeta ? (
        <>
          <span aria-hidden>/</span>
          <Link href={areaMeta.href} className="hover:text-white/80">
            {areaMeta.label}
          </Link>
        </>
      ) : null}
      {route ? (
        <>
          <span aria-hidden>/</span>
          <span className="truncate font-medium text-white/90">{route.label}</span>
        </>
      ) : null}
    </nav>
  );
}

function SetupMobileBreadcrumb({ pathname, area }: { pathname: string; area: SetupArea | null }) {
  const route = getSetupRouteByPath(pathname);
  const areaMeta = area ? SETUP_AREAS.find((a) => a.id === area) : null;
  if (!areaMeta && !route) return null;

  return (
    <nav
      aria-label="Setup location"
      className="mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-white/50 sm:hidden"
    >
      <Link href="/setup" className="hover:text-white/80">
        Setup
      </Link>
      {areaMeta ? (
        <>
          <span aria-hidden>/</span>
          <span className="text-white/70">{areaMeta.label}</span>
        </>
      ) : null}
      {route ? (
        <>
          <span aria-hidden>/</span>
          <span className="font-medium text-white/90">{route.label}</span>
        </>
      ) : null}
    </nav>
  );
}

export function SetupShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const area = resolveArea(pathname);
  const isLanding = isSetupLandingPath(pathname);
  const [navCollapsed, setNavCollapsed] = useState(false);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] text-[var(--text)]">
      <div className="mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-5 sm:py-5 lg:px-6">
        {/* The top nav lives OUTSIDE the scroll area (page scrolls inside <main>), so this bar
            sticks to top-0 of the scrollport — flush under the horizontal nav, not 3.5rem below it.
            Opaque (not /85) so the page title slides cleanly behind it instead of ghosting through. */}
        <div className="sticky top-0 z-20 -mx-3 mb-4 flex items-center gap-3 bg-[var(--bg)] px-3 py-2 sm:-mx-5 sm:px-5">
          <Link
            href="/home"
            className="shrink-0 text-sm font-medium text-amber-300/90 hover:text-amber-200 hover:underline"
          >
            ← Dashboard
          </Link>
          {!isLanding ? <SetupBreadcrumb pathname={pathname} area={area} /> : null}
          {!isLanding ? (
            <button
              type="button"
              onClick={() => setNavCollapsed((v) => !v)}
              className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-white/70 transition hover:bg-white/[0.04] hover:text-white"
              aria-expanded={!navCollapsed}
              aria-label={navCollapsed ? "Show setup navigation" : "Hide setup navigation"}
            >
              {navCollapsed ? (
                <>
                  <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden />
                  Show nav
                </>
              ) : (
                <>
                  <PanelLeftClose className="h-3.5 w-3.5" aria-hidden />
                  Hide nav
                </>
              )}
            </button>
          ) : null}
        </div>

        <div className={`flex w-full gap-6 ${isLanding ? "" : "lg:gap-8"}`}>
          {!isLanding && !navCollapsed ? (
            <aside className="w-full shrink-0 lg:sticky lg:top-12 lg:w-48 lg:self-start xl:w-52">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300/80">
                Setup
              </p>
              <nav className="mt-1.5 space-y-0.5" aria-label="Setup areas">
                {SETUP_AREAS.map((a) => {
                  const active = area === a.id || pathname === a.href;
                  const childActive = routeChildActive(pathname, a.href);
                  return (
                    <Link
                      key={a.id}
                      href={a.href}
                      className={`block rounded-lg px-2.5 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40 ${
                        active
                          ? "bg-amber-500/15 font-medium text-amber-100"
                          : "text-white/65 hover:bg-white/[0.04] hover:text-white/90"
                      }`}
                      aria-current={active && !childActive ? "page" : undefined}
                    >
                      {a.label}
                    </Link>
                  );
                })}
              </nav>
              {area ? <SetupSectionNav area={area} pathname={pathname} /> : null}
            </aside>
          ) : null}

          <div className="min-w-0 flex-1">
            {!isLanding ? <SetupMobileBreadcrumb pathname={pathname} area={area} /> : null}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
