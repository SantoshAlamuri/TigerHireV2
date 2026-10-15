"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import TigerHireLogo from "@/components/TigerHireLogo";
import { ROLE_LABELS, ROLE_DASHBOARD_PATH } from "@/types/database";
import { type NavGroup, type NavItem } from "@/components/dashboard/sidebar-nav-groups";
import {
  getActiveNavHref,
  getNavHrefs,
  navHrefMatchesPathname,
  useDashboardNavGroups,
} from "@/components/dashboard/navigation";
import { X, ChevronRight } from "lucide-react";
import {
  Fragment,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useLayoutEffect,
  type TouchEvent,
} from "react";

const SIDEBAR_NAV_SCROLL_KEY = "tigerhire.sidebarNavScrollY";
/** When false, multi-item groups that are not `autoHide` start expanded for faster discovery. */
const COLLAPSE_GROUPS_BY_DEFAULT = false;

function readSidebarNavScrollY(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = sessionStorage.getItem(SIDEBAR_NAV_SCROLL_KEY);
    if (raw == null) return 0;
    const y = parseInt(raw, 10);
    return Number.isFinite(y) ? Math.max(0, y) : 0;
  } catch {
    return 0;
  }
}

function writeSidebarNavScrollY(y: number) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SIDEBAR_NAV_SCROLL_KEY, String(Math.max(0, Math.floor(y))));
  } catch {
    /* storage full / private mode */
  }
}

/** Mouse / pen: avoid focusing the link so the browser does not scroll it inside the overflow nav. */
function suppressNavLinkPointerFocus(e: React.PointerEvent<HTMLAnchorElement>) {
  if (e.pointerType === "touch") return;
  if (e.button !== 0) return;
  e.preventDefault();
}

function isLargeViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth >= 1024;
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, loading, navGroups } = useDashboardNavGroups();
  const pathname = usePathname();
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  /** Explicit expand/collapse for sidebar section groups (multi-item groups only). */
  const [navGroupExpanded, setNavGroupExpanded] = useState<Record<string, boolean>>({});
  // Avoid hydration mismatch: server and first client paint both show loading until mounted.
  const [mounted, setMounted] = useState(false);
  const navScrollRef = useRef<HTMLElement | null>(null);
  const drawerTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  const onDrawerTouchStart = useCallback(
    (e: TouchEvent) => {
      if (isLargeViewport() || !open) return;
      const t = e.touches[0];
      drawerTouchStartRef.current = { x: t.clientX, y: t.clientY };
    },
    [open],
  );

  const onDrawerTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (isLargeViewport()) return;
      const start = drawerTouchStartRef.current;
      drawerTouchStartRef.current = null;
      if (!start || !open) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) > Math.abs(dy) && dx < -56) onClose();
    },
    [open, onClose],
  );

  const persistNavScroll = useCallback(() => {
    const el = navScrollRef.current;
    if (el) writeSidebarNavScrollY(el.scrollTop);
  }, []);

  const applyStoredNavScroll = useCallback(() => {
    const el = navScrollRef.current;
    if (!el) return;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    const y = Math.min(readSidebarNavScrollY(), max);
    el.scrollTop = y;
  }, []);

  // The dashboard shell now lives in the (dashboard) route-group layout, so it —
  // and this sidebar — persist across in-segment navigation and scrollTop is kept
  // for free (F-14). We therefore restore the saved position only on a cold mount,
  // once the async nav groups have populated and the scroll container exists, rather
  // than re-running on every pathname change as if the sidebar remounted each time.
  const navReady = mounted && navGroups.length > 0;
  useLayoutEffect(() => {
    if (!navReady) return;
    applyStoredNavScroll();
    let cancelled = false;
    let n = 0;
    const run = () => {
      if (cancelled) return;
      applyStoredNavScroll();
      if (n++ < 2) requestAnimationFrame(run);
    };
    const id = requestAnimationFrame(run);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [navReady, applyStoredNavScroll]);

  // Show loading state while auth is initializing, or until mounted so server and client first paint match.
  // Use pathname for logo href so candidates on /candidate/* don't get sent to "/" when clicking during load
  const loadingLogoHref = pathname.startsWith("/candidate") ? "/candidate" : "/";
  const allNavItems = useMemo(() => navGroups.flatMap((g) => g.items), [navGroups]);

  const allNavHrefs = useMemo(() => getNavHrefs(allNavItems), [allNavItems]);

  const activeNavWinnerHref = useMemo(
    () => getActiveNavHref(pathname, allNavHrefs),
    [allNavHrefs, pathname],
  );

  const isRouteActive = (href: string) => navHrefMatchesPathname(pathname, href);

  const navGroupKey = (group: NavGroup) => `${user?.role ?? "unknown"}::${group.label}`;

  const groupContainsActiveRoute = (group: NavGroup) =>
    group.items.some(
      (item) =>
        isRouteActive(item.href) || Boolean(item.children?.some((c) => isRouteActive(c.href))),
    );

  const toggleNavGroupSection = (group: NavGroup) => {
    if (!user || group.items.length <= 1) return;
    const key = navGroupKey(group);
    if (groupContainsActiveRoute(group)) return;
    const defaultExpanded = COLLAPSE_GROUPS_BY_DEFAULT ? false : !group.autoHide;
    setNavGroupExpanded((prev) => {
      const isOpen = prev[key] ?? defaultExpanded;
      return { ...prev, [key]: !isOpen };
    });
  };

  useEffect(() => {
    const activeParents = new Set(
      allNavItems
        .filter((item) => item.children?.some((child) => isRouteActive(child.href)))
        .map((item) => item.href),
    );
    if (activeParents.size === 0) return;
    setExpandedMenus((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const href of activeParents) {
        if (!next[href]) {
          next[href] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [allNavItems, pathname]);

  const toggleMenu = (itemHref: string) => {
    setExpandedMenus((prev) => {
      const item = allNavItems.find((x) => x.href === itemHref);
      const subtree =
        item?.children?.some((c) => navHrefMatchesPathname(pathname, c.href)) ?? false;
      if (subtree) return prev;
      const isOpen = prev[itemHref] === true;
      return { ...prev, [itemHref]: !isOpen };
    });
  };

  const itemRowKey = (item: NavItem) => `${item.href}::${item.label}`;

  const renderNavItem = (item: NavItem) => {
    const hasChildren = Boolean(item.children && item.children.length > 0);
    const subtreeHasMatch = Boolean(
      item.children?.some((child) => navHrefMatchesPathname(pathname, child.href)),
    );
    const isExpanded = subtreeHasMatch || expandedMenus[item.href] === true;
    if (!hasChildren) {
      const isActive = activeNavWinnerHref === item.href;
      return (
        <li key={itemRowKey(item)}>
          <Link
            href={item.href}
            scroll={false}
            onPointerDown={suppressNavLinkPointerFocus}
            onClick={onClose}
            aria-current={isActive ? "page" : undefined}
            className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 focus-ring ${
              isActive
                ? "bg-white/[0.04] text-white"
                : "text-white/65 hover:bg-white/[0.04] hover:text-white active:scale-[0.98]"
            }`}
          >
            {isActive && (
              <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--accent)]" />
            )}
            <span
              className={isActive ? "text-white/80" : "text-white/45 group-hover:text-white/70"}
            >
              {item.icon}
            </span>
            {item.label}
          </Link>
        </li>
      );
    }

    const parentIsWinner = activeNavWinnerHref === item.href;
    return (
      <li key={itemRowKey(item)}>
        <div
          className={`relative flex items-center gap-1 rounded-lg px-1 py-1 transition-all duration-150 ${
            parentIsWinner ? "" : "hover:bg-white/[0.04]"
          }`}
        >
          {parentIsWinner && (
            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--accent)]" />
          )}
          <Link
            href={item.href}
            scroll={false}
            onPointerDown={suppressNavLinkPointerFocus}
            onClick={onClose}
            aria-current={parentIsWinner ? "page" : undefined}
            className={`group flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors focus-ring ${
              parentIsWinner ? "text-white" : "text-white/65 hover:text-white"
            }`}
          >
            <span
              className={
                parentIsWinner ? "text-white/80" : "text-white/45 group-hover:text-white/70"
              }
            >
              {item.icon}
            </span>
            <span className="truncate">{item.label}</span>
          </Link>
          <button
            type="button"
            onClick={() => toggleMenu(item.href)}
            className="rounded-md p-1.5 text-white/45 transition-colors hover:bg-white/[0.04] hover:text-white focus-ring"
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${item.label}`}
            aria-expanded={isExpanded}
          >
            <span
              className={`block transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
            >
              <ChevronRight size={14} />
            </span>
          </button>
        </div>
        {isExpanded && (
          <ul className="mt-1 space-y-0.5 border-l border-[var(--border)] ml-[22px] pl-4">
            {item.children!.map((child) => {
              const childIsActive = activeNavWinnerHref === child.href;
              return (
                <li key={child.href}>
                  <Link
                    href={child.href}
                    scroll={false}
                    onPointerDown={suppressNavLinkPointerFocus}
                    onClick={onClose}
                    aria-current={childIsActive ? "page" : undefined}
                    className={`block rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 focus-ring ${
                      childIsActive
                        ? "bg-white/[0.05] text-white"
                        : "text-white/55 hover:bg-white/[0.04] hover:text-white active:scale-[0.98]"
                    }`}
                  >
                    {child.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  };

  const renderNavList = (items: NavItem[], listExtraClass = "") => (
    <ul className={`space-y-1${listExtraClass ? ` ${listExtraClass}` : ""}`}>
      {items.map((item, idx) => {
        const prev = idx > 0 ? items[idx - 1] : undefined;
        const showCluster = Boolean(item.cluster && item.cluster !== prev?.cluster);
        return (
          <Fragment key={itemRowKey(item)}>
            {showCluster ? (
              <li
                className={`pointer-events-none list-none pb-0.5 ${idx === 0 ? "pt-0.5" : "pt-2"}`}
              >
                <p className="px-3 text-caption font-semibold uppercase tracking-[0.14em] text-[var(--text-subtle)]">
                  {item.cluster}
                </p>
              </li>
            ) : null}
            {renderNavItem(item)}
          </Fragment>
        );
      })}
    </ul>
  );

  const renderNavGroups = (groups: NavGroup[]) => (
    <div className="space-y-4">
      {groups.map((group, i) => {
        const isSingleSection = group.items.length <= 1;
        const sectionKey = navGroupKey(group);
        const sectionHasActive = groupContainsActiveRoute(group);
        const defaultExpanded = COLLAPSE_GROUPS_BY_DEFAULT ? false : !group.autoHide;
        const sectionExpanded =
          isSingleSection || sectionHasActive || (navGroupExpanded[sectionKey] ?? defaultExpanded);
        const headingClass = `text-left text-label font-semibold uppercase tracking-[0.16em] ${
          group.subtle ? "text-[var(--text-subtle)]/60" : "text-[var(--text-subtle)]"
        }`;

        return (
          <div key={group.label} className={i > 0 ? "border-t border-[var(--border)] pt-3" : ""}>
            {isSingleSection ? (
              <>
                <p className={`px-3 pb-1.5 ${headingClass}`}>{group.label}</p>
                {renderNavList(group.items)}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => toggleNavGroupSection(group)}
                  className={`group/sec flex w-full items-center justify-between gap-2 rounded-md px-3 py-1 text-white/50 transition-colors hover:text-white/80 focus-ring ${
                    sectionExpanded ? "mb-1" : ""
                  }`}
                  aria-expanded={sectionExpanded}
                  aria-controls={`sidebar-nav-group-${sectionKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
                >
                  <span className={headingClass}>{group.label}</span>
                  <span
                    className={`shrink-0 text-white/35 transition-transform duration-150 group-hover/sec:text-white/55 ${
                      sectionExpanded ? "rotate-90" : ""
                    }`}
                    aria-hidden
                  >
                    <ChevronRight size={12} strokeWidth={2} />
                  </span>
                </button>
                {sectionExpanded ? (
                  <div id={`sidebar-nav-group-${sectionKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`}>
                    {renderNavList(group.items)}
                  </div>
                ) : null}
              </>
            )}
          </div>
        );
      })}
    </div>
  );

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [open, onClose]);

  if (!mounted || loading || !user) {
    return (
      <>
        {open && (
          <div
            className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm lg:hidden"
            onClick={onClose}
            aria-hidden
          />
        )}
        <aside
          className={`fixed inset-y-0 left-0 z-[60] flex min-h-0 w-64 max-w-[85vw] flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl transition-transform duration-200 ease-out lg:hidden touch-pan-y ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
          onTouchStart={onDrawerTouchStart}
          onTouchEnd={onDrawerTouchEnd}
        >
          <div className="flex h-14 shrink-0 items-center border-b border-[var(--border)] px-4">
            <TigerHireLogo href={loadingLogoHref} variant="dark" size="sm" className="h-7 w-auto" />
            {open && (
              <button
                type="button"
                onClick={onClose}
                className="ml-auto text-[var(--text-muted)] lg:hidden"
                aria-label="Close sidebar"
              >
                <X size={20} />
              </button>
            )}
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
          </div>
        </aside>
      </>
    );
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-[60] flex min-h-0 w-64 max-w-[85vw] flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl transition-transform duration-200 ease-out lg:hidden touch-pan-y ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        onTouchStart={onDrawerTouchStart}
        onTouchEnd={onDrawerTouchEnd}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-3">
          <TigerHireLogo
            href={ROLE_DASHBOARD_PATH[user.role] ?? "/candidate"}
            variant="dark"
            size="sm"
            className="h-7 w-auto"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-muted)] lg:hidden"
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>

        <nav
          ref={navScrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-4 [overflow-anchor:none]"
          onScroll={persistNavScroll}
          onPointerDownCapture={persistNavScroll}
          onClickCapture={persistNavScroll}
        >
          {renderNavGroups(navGroups)}
        </nav>

        <div className="shrink-0 border-t border-[var(--border)] px-3 py-2">
          <p className="truncate px-3 py-1 text-xs text-[var(--text-subtle)]">
            {user.name} · {ROLE_LABELS[user.role] ?? "User"}
          </p>
        </div>
      </aside>
    </>
  );
}
