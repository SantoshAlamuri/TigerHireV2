"use client";
import { useEffect, useRef, useState } from "react";
import { createQueue, currentItem, type QueueItem } from "./review-queue";

export function useReviewWorkspace(items: QueueItem[], key: string, requestedId: string | null) {
  const [queue, setQueue] = useState(() => createQueue([]));
  const lastRequested = useRef<string | null>(null);
  const loadedKey = useRef("");
  useEffect(() => {
    if (!items.length) {
      setQueue(createQueue([]));
      return;
    }
    let restored: { current?: string; selected?: string[] } = {};
    if (loadedKey.current !== key) {
      try {
        restored = JSON.parse(sessionStorage.getItem(key) ?? "{}");
      } catch {
        /* Ignore invalid preferences. */
      }
    }
    const firstLoad = loadedKey.current !== key;
    const requestChanged = lastRequested.current !== requestedId;
    lastRequested.current = requestedId;
    loadedKey.current = key;
    setQueue((previous) => {
      const ids = new Set(items.map((item) => item.id));
      const current = firstLoad ? (requestedId ?? restored.current) : currentItem(previous)?.id;
      const selected = firstLoad ? restored.selected : previous.selected;
      return {
        ...createQueue(items),
        cursor: Math.max(
          0,
          items.findIndex((item) => item.id === current),
        ),
        selected: Array.isArray(selected)
          ? selected.filter((id) => typeof id === "string" && ids.has(id))
          : [],
        decisions: firstLoad ? [] : previous.decisions.filter((decision) => ids.has(decision.id)),
      };
    });
  }, [items, key, requestedId]);
  useEffect(() => {
    if (!queue.items.length) return;
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({ current: currentItem(queue)?.id, selected: queue.selected }),
      );
    } catch {
      /* Optional session continuity. */
    }
  }, [key, queue]);
  return [queue, setQueue] as const;
}
