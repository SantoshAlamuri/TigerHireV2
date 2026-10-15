"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

// "danger" is the canonical tone (matches the --status-* vocabulary + StatusBadge);
// "error" is kept as a backwards-compatible alias for existing call sites.
type ToastTone = "success" | "danger" | "error" | "info" | "warning";

type ToastAction = {
  label: string;
  onClick: () => void;
};

type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
  action?: ToastAction;
};

type ToastRecord = {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  duration: number;
  action?: ToastAction;
  leaving: boolean;
};

type ToastContextValue = {
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// Single status-color source of truth: drive the accent border off the same
// --status-*-fg tokens StatusBadge uses, instead of a third 400-level palette (F-01).
function toneBorderClass(tone: ToastTone): string {
  switch (tone) {
    case "success":
      return "border-l-[color:var(--status-success-fg)]";
    case "error":
    case "danger":
      return "border-l-[color:var(--status-danger-fg)]";
    case "warning":
      return "border-l-[color:var(--status-warning-fg)]";
    default:
      return "border-l-[color:var(--status-info-fg)]";
  }
}

function toneRole(tone: ToastTone): "status" | "alert" {
  return tone === "error" || tone === "danger" || tone === "warning" ? "alert" : "status";
}

function makeToastId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ToastItem({ item, onDismiss }: { item: ToastRecord; onDismiss: (id: string) => void }) {
  const [entered, setEntered] = useState(false);
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (item.duration === 0 || hovered || item.leaving) return;
    timerRef.current = window.setTimeout(() => {
      onDismiss(item.id);
    }, item.duration);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [hovered, item.duration, item.id, item.leaving, onDismiss]);

  const active = entered && !item.leaving;
  const motionClass = active
    ? "opacity-100 translate-y-0 sm:translate-x-0"
    : "opacity-0 translate-y-2 sm:translate-y-0 sm:translate-x-4";
  const motionTimingClass = item.leaving ? "duration-[140ms] ease-in" : "duration-[180ms] ease-out";

  return (
    <div
      role={toneRole(item.tone)}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onDismiss(item.id);
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`card-lifted pointer-events-auto relative border-l-4 px-4 py-3 transition-all ${motionTimingClass} ${toneBorderClass(item.tone)} ${motionClass}`}
    >
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="absolute right-2 top-2 text-white/40 transition hover:text-white"
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>

      <div className="pr-6">
        <p className="text-sm font-extrabold text-white">{item.title}</p>
        {item.description ? (
          <p className="mt-0.5 text-xs text-white/60">{item.description}</p>
        ) : null}
      </div>

      {item.action ? (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={item.action.onClick}
            className="text-xs font-bold uppercase tracking-wider text-[var(--accent)] transition hover:text-[var(--accent-hover)]"
          >
            {item.action.label}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 140);
  }, []);

  const toast = useCallback((input: ToastInput): string => {
    const id = makeToastId();
    const next: ToastRecord = {
      id,
      title: input.title,
      description: input.description,
      tone: input.tone ?? "info",
      duration: input.duration ?? 4000,
      action: input.action,
      leaving: false,
    };
    setToasts((prev) => [next, ...prev].slice(0, 3));
    return id;
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 left-1/2 z-[140] flex w-[calc(100vw-32px)] max-w-[420px] -translate-x-1/2 flex-col gap-2 sm:bottom-6 sm:left-auto sm:right-6 sm:w-[360px] sm:translate-x-0"
      >
        {toasts.map((item) => (
          <ToastItem key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
