"use client";

import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { WHATSAPP_CV_DROP_LINK, WHATSAPP_QR_URL } from "@/lib/config/whatsapp";

/**
 * Floating WhatsApp widget — shows a green FAB in the bottom-right corner.
 * On click, opens a popover with QR code + direct chat button.
 */
export default function WhatsAppWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Popover */}
      {open && (
        <div className="mb-3 w-72 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-2xl animate-fade-up">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle size={18} className="text-[#25D366]" />
              <h4 className="text-sm font-semibold text-[var(--text)]">Chat with TigerHire</h4>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-[var(--text-muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Drop your CV on WhatsApp and get FitScore matches as soon as scoring completes. No
            sign-up needed.
          </p>
          <div className="mt-4 flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={WHATSAPP_QR_URL}
              alt="Scan to chat on WhatsApp"
              width={140}
              height={140}
              className="rounded-lg border border-[var(--border)] bg-white p-1.5"
            />
            <span className="text-xs text-[var(--text-subtle)]">Scan QR to start</span>
            <a
              href={WHATSAPP_CV_DROP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] py-2.5 text-sm font-semibold text-white transition hover:bg-[#1DA851]"
            >
              <MessageCircle size={16} />
              Open WhatsApp
            </a>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:bg-[#1DA851] hover:shadow-xl"
        aria-label={open ? "Close WhatsApp chat" : "Chat on WhatsApp"}
      >
        {open ? <X size={24} /> : <MessageCircle size={24} />}
      </button>
    </div>
  );
}
