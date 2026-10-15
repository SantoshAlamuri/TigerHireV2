"use client";
import { useEffect } from "react";

/** Restore the same view after its content has loaded; store no candidate data. */
export function useWorkspaceScroll(key: string, ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const storageKey = `tigerhire.scroll:${key}`;
    let stored = 0;
    try {
      stored = Number(sessionStorage.getItem(storageKey) ?? 0);
    } catch {
      /* Storage can be disabled. */
    }
    const scroller = document.getElementById("main-content");
    const target = scroller ?? window;
    let lastTop = Number.isFinite(stored) ? stored : 0;
    const frame = requestAnimationFrame(() => target.scrollTo({ top: lastTop }));
    const record = () => {
      lastTop = scroller ? scroller.scrollTop : window.scrollY;
    };
    target.addEventListener("scroll", record, { passive: true });
    const save = () => {
      try {
        sessionStorage.setItem(storageKey, String(lastTop));
      } catch {
        /* Optional preference only. */
      }
    };
    window.addEventListener("pagehide", save);
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener("scroll", record);
      save();
      window.removeEventListener("pagehide", save);
    };
  }, [key, ready]);
}
