"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const BAR_FINISH_HIDE_MS = 180;
const BAR_TICK_MS = 180;
const BAR_MAX_AUTO_PROGRESS = 82;
const BAR_INITIAL_PROGRESS = 14;

function isSameRoute(current: URL, next: URL): boolean {
  return (
    current.pathname === next.pathname &&
    current.search === next.search &&
    current.hash === next.hash
  );
}

function shouldTrackHistoryStateNavigation(url: string | URL | null | undefined): boolean {
  if (!url) return false;
  try {
    const current = new URL(window.location.href);
    const next = new URL(String(url), window.location.href);
    return !isSameRoute(current, next);
  } catch {
    return false;
  }
}

function shouldTrackAnchorNavigation(anchor: HTMLAnchorElement): boolean {
  const href = anchor.getAttribute("href");
  if (!href) return false;
  if (href.startsWith("#")) return false;
  if (href.startsWith("mailto:")) return false;
  if (href.startsWith("tel:")) return false;
  if (anchor.hasAttribute("download")) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  return true;
}

export function PageTransitions({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const search = useMemo(() => searchParams.toString(), [searchParams]);
  const routeKey = useMemo(() => `${pathname}${search ? `?${search}` : ""}`, [pathname, search]);

  const [progress, setProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);

  const hasMountedRef = useRef(false);
  const progressTickRef = useRef<number | null>(null);
  const finishTimerRef = useRef<number | null>(null);
  const deferredStartRef = useRef<number | null>(null);

  const clearProgressTick = () => {
    if (progressTickRef.current) {
      window.clearInterval(progressTickRef.current);
      progressTickRef.current = null;
    }
  };

  const clearFinishTimer = () => {
    if (finishTimerRef.current) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
  };

  const clearDeferredStart = () => {
    if (deferredStartRef.current) {
      window.cancelAnimationFrame(deferredStartRef.current);
      deferredStartRef.current = null;
    }
  };

  const startNavigation = () => {
    clearFinishTimer();
    setShowProgress(true);
    setProgress((prev) => (prev > BAR_INITIAL_PROGRESS ? prev : BAR_INITIAL_PROGRESS));
    clearProgressTick();
    progressTickRef.current = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= BAR_MAX_AUTO_PROGRESS) {
          return prev;
        }
        const next = prev + Math.max(1, (BAR_MAX_AUTO_PROGRESS - prev) * 0.18);
        return Math.min(BAR_MAX_AUTO_PROGRESS, next);
      });
    }, BAR_TICK_MS);
  };

  const scheduleStartNavigation = () => {
    if (deferredStartRef.current) return;
    deferredStartRef.current = window.requestAnimationFrame(() => {
      deferredStartRef.current = null;
      startNavigation();
    });
  };

  const finishNavigation = () => {
    clearProgressTick();
    setProgress(100);
    clearFinishTimer();
    finishTimerRef.current = window.setTimeout(() => {
      setShowProgress(false);
      setProgress(0);
    }, BAR_FINISH_HIDE_MS);
  };

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    finishNavigation();
  }, [routeKey]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const anchorCandidate = target?.closest("a[href]");
      if (!(anchorCandidate instanceof HTMLAnchorElement)) return;
      if (!shouldTrackAnchorNavigation(anchorCandidate)) return;

      const current = new URL(window.location.href);
      const next = new URL(anchorCandidate.href, window.location.href);
      if (next.origin !== current.origin) return;
      if (isSameRoute(current, next)) return;

      scheduleStartNavigation();
    };

    const onPopState = () => {
      scheduleStartNavigation();
    };

    const rawPushState = window.history.pushState.bind(window.history);
    const rawReplaceState = window.history.replaceState.bind(window.history);

    window.history.pushState = (...args) => {
      if (shouldTrackHistoryStateNavigation(args[2])) {
        scheduleStartNavigation();
      }
      rawPushState(...args);
    };

    window.history.replaceState = (...args) => {
      if (shouldTrackHistoryStateNavigation(args[2])) {
        scheduleStartNavigation();
      }
      rawReplaceState(...args);
    };

    document.addEventListener("click", onDocumentClick, { capture: true });
    window.addEventListener("popstate", onPopState);

    return () => {
      document.removeEventListener("click", onDocumentClick, { capture: true });
      window.removeEventListener("popstate", onPopState);
      window.history.pushState = rawPushState;
      window.history.replaceState = rawReplaceState;
      clearProgressTick();
      clearFinishTimer();
      clearDeferredStart();
    };
  }, []);

  const progressStyle = {
    "--route-progress-width": `${progress}%`,
  } as CSSProperties;

  return (
    <>
      <div className={`route-progress ${showProgress ? "route-progress--active" : ""}`} aria-hidden>
        <div className="route-progress__bar" style={progressStyle} />
      </div>
      <div className="route-content">{children}</div>
    </>
  );
}
