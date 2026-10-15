"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const PIN_KEY = "th_work_side_pinned";

function readPinned(): boolean {
  try {
    return window.localStorage.getItem(PIN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The side panel hides itself. A slim rail stays on the left; point at it (or
 * tab into it) and the full panel slides over the page, then slides away when
 * you leave. Pin it to keep it open beside the work. The choice is remembered
 * on this browser.
 */
export function SideFrame({
  rail,
  label,
  children,
}: {
  rail: ReactNode;
  label: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [pinned, setPinnedState] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => setPinnedState(readPinned()), []);
  // Opening something from the panel closes it, so the work has the room.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const setPinned = useCallback((next: boolean) => {
    setPinnedState(next);
    setOpen(false);
    try {
      window.localStorage.setItem(PIN_KEY, next ? "1" : "0");
    } catch {
      // private mode: the choice lasts until reload
    }
  }, []);

  const show = () => {
    window.clearTimeout(timer.current);
    setOpen(true);
  };
  const hide = (delay = 220) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), delay);
  };

  return (
    <div
      className={`wd-sideframe ${pinned ? "pinned" : ""} ${open ? "open" : ""}`}
      onMouseEnter={pinned ? undefined : show}
      onMouseLeave={pinned ? undefined : () => hide()}
      onFocus={pinned ? undefined : show}
      onBlur={
        pinned
          ? undefined
          : (e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hide(0);
            }
      }
      onKeyDown={(e) => {
        if (e.key === "Escape" && !pinned && open) {
          setOpen(false);
          (document.activeElement as HTMLElement | null)?.blur();
        }
      }}
    >
      {!pinned && (
        <nav className="wd-rail" aria-label="Shortcuts">
          {rail}
        </nav>
      )}
      <aside className="wd-side" aria-label={label}>
        <button
          type="button"
          className="wd-pin"
          aria-pressed={pinned}
          aria-label={pinned ? "Hide the side panel" : "Keep the side panel open"}
          title={pinned ? "Hide" : "Keep open"}
          onClick={() => setPinned(!pinned)}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <rect
              x="1.5"
              y="2.5"
              width="13"
              height="11"
              rx="2.5"
              fill="none"
              stroke="currentColor"
            />
            <rect
              x="3.5"
              y="4.5"
              width="3"
              height="7"
              rx="1"
              fill="currentColor"
              opacity={pinned ? 1 : 0.35}
            />
          </svg>
        </button>
        {children}
      </aside>
    </div>
  );
}
