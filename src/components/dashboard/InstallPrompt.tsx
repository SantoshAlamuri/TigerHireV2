"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const pathname = usePathname();
  const isFocusedWorkspace =
    /^\/(?:admin|recruit\/(?:jobs|v2\/jobs|hiring-requests|candidates|applications)|company\/(?:jobs|hiring-requests))(?:\/|$)/.test(
      pathname ?? "",
    );
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window !== "undefined") {
      return !!sessionStorage.getItem("pwa-install-dismissed");
    }
    return false;
  });

  useEffect(() => {
    if (dismissed) return;

    function handler(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [dismissed]);

  if (!deferredPrompt || dismissed || isFocusedWorkspace) return null;

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  }

  function handleDismiss() {
    setDismissed(true);
    sessionStorage.setItem("pwa-install-dismissed", "1");
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm rounded-xl border border-orange-200 bg-white p-4 shadow-lg sm:left-auto sm:right-6 sm:bottom-6">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        aria-label="Dismiss install prompt"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50">
          <Download className="h-5 w-5 text-orange-500" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">Install TigerHire</p>
          <p className="mt-0.5 text-xs text-gray-500">Add to your home screen for faster access.</p>
          <button
            onClick={handleInstall}
            className="mt-2 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
          >
            Install
          </button>
        </div>
      </div>
    </div>
  );
}
