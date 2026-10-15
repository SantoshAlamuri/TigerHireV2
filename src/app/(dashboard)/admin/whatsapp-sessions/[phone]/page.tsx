"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, Send } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery, useApiMutation, invalidateQueries } from "@/lib/hooks/use-api";

interface WhatsAppSessionRow {
  id: string;
  phone: string;
  session_state: string;
  context: Record<string, unknown>;
  last_message_at: string;
  created_at: string;
  last_candidate_message_at?: string | null;
  qa_step?: number | null;
  alerts_expires_at?: string | null;
  alert_last_sent_at?: string | null;
}

interface SessionsResponse {
  sessions: WhatsAppSessionRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface MessageLogRow {
  id: string;
  phone: string;
  direction: string;
  wa_message_id: string | null;
  message_type: string;
  body_preview: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface MessagesResponse {
  messages: MessageLogRow[];
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function getHandoverMeta(ctx: Record<string, unknown>): {
  isHandover: boolean;
  reason: string | null;
  requestedAt: string | null;
} {
  const isHandover = ctx.conversation_outcome === "handover";
  const reason = typeof ctx.handover_reason === "string" ? ctx.handover_reason : null;
  const requestedAt =
    typeof ctx.handover_requested_at === "string" ? ctx.handover_requested_at : null;
  return { isHandover, reason, requestedAt };
}

export default function AdminWhatsAppSessionDetailPage() {
  const params = useParams();
  const rawParam = typeof params.phone === "string" ? params.phone : "";
  const phoneDigits = useMemo(() => rawParam.replace(/\D/g, ""), [rawParam]);

  const queryParams = useMemo(
    () => (phoneDigits.length >= 8 ? { phone: phoneDigits } : {}),
    [phoneDigits],
  );

  const { data, loading, error, refetch } = useApiQuery<SessionsResponse>(
    phoneDigits.length >= 8 ? "/api/admin/whatsapp-sessions" : null,
    queryParams,
  );

  const messagesParams = useMemo(
    () => (phoneDigits.length >= 8 ? { phone: phoneDigits, limit: 100 } : {}),
    [phoneDigits],
  );

  const {
    data: messagesData,
    loading: messagesLoading,
    error: messagesError,
    refetch: refetchMessages,
  } = useApiQuery<MessagesResponse>(
    phoneDigits.length >= 8 ? "/api/admin/whatsapp-messages" : null,
    messagesParams,
  );

  const session = data?.sessions?.[0] ?? null;
  const recentMessages = messagesData?.messages ?? [];

  const { mutate: sendMessage, loading: sending } = useApiMutation<
    { phone: string; message: string },
    { ok: boolean; messageId?: string }
  >("/api/admin/whatsapp-sessions/send", "POST");

  const [replyText, setReplyText] = useState("");
  const [sendNotice, setSendNotice] = useState<string | null>(null);

  const candidateId =
    session?.context && typeof session.context.candidate_id === "string"
      ? session.context.candidate_id
      : null;
  const candidateHref =
    candidateId && isUuid(candidateId) ? `/recruit/candidates/${candidateId}` : null;
  const handoverMeta = getHandoverMeta(session?.context ?? {});

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSendNotice(null);
    const trimmed = replyText.trim();
    if (!trimmed || !phoneDigits) return;

    const res = await sendMessage({ phone: phoneDigits, message: trimmed });
    if (res?.ok) {
      setReplyText("");
      setSendNotice("Message sent.");
      invalidateQueries("/api/admin/whatsapp-sessions");
      invalidateQueries("/api/admin/whatsapp-messages");
      void refetch({ silent: true });
      void refetchMessages({ silent: true });
    }
  }

  return (
    <>
      <PageHeader
        title="WhatsApp session"
        subtitle="Session state, recent logged traffic, and replies via your WhatsApp Business Cloud API number."
      />
      <div className="mb-6">
        <Link
          href="/admin/whatsapp-sessions"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--accent)] hover:underline"
        >
          <ArrowLeft size={16} />
          Back to sessions
        </Link>
      </div>

      {phoneDigits.length < 8 ? (
        <p className="text-sm text-white/60">Invalid phone in URL.</p>
      ) : loading && !data ? (
        <div className="space-y-2 rounded-xl card-lifted p-4">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      ) : error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : !session ? (
        <p className="text-sm text-white/60">
          No session row for <span className="font-mono">+{phoneDigits}</span>. They may not have
          messaged the business number yet.
        </p>
      ) : (
        <div className="space-y-8">
          {handoverMeta.isHandover && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-amber-200">
                  <AlertTriangle size={16} />
                  Human handover requested
                </p>
                {handoverMeta.requestedAt && (
                  <span className="text-xs text-amber-100/80">
                    {formatDateTime(handoverMeta.requestedAt)}
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-amber-100/90">
                Reason:{" "}
                <span className="font-semibold">
                  {(handoverMeta.reason ?? "unspecified").replaceAll("_", " ")}
                </span>
                . Please send a human follow-up message below to meet SLA.
              </p>
            </div>
          )}
          <div className="card-lifted rounded-xl p-6">
            <div>
              <p className="font-mono text-lg font-semibold text-[var(--text)]">+{session.phone}</p>
              <p className="mt-1 text-sm text-white/60">
                State:{" "}
                <span className="rounded-md bg-white/[0.04] px-2 py-0.5 font-medium text-white/55 ring-1 ring-inset ring-white/[0.06]">
                  {session.session_state}
                </span>
              </p>
              <p className="mt-2 text-xs text-white/60">
                Last activity: {formatDateTime(session.last_message_at)}
                {session.last_candidate_message_at && (
                  <>
                    {" · "}
                    Last candidate message: {formatDateTime(session.last_candidate_message_at)}
                  </>
                )}
              </p>
              <p className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--background)]/80 px-3 py-2 text-xs leading-relaxed text-white/60">
                This number is the contact as seen on the{" "}
                <strong className="text-[var(--text)]">WhatsApp Business Cloud API</strong> (often a
                dedicated or virtual sender). Replies below are sent{" "}
                <strong className="text-[var(--text)]">from that business line</strong>, not from
                WhatsApp Web/Desktop on your personal account, and a wa.me link would not use the
                same sender.
              </p>
            </div>
            {candidateHref && (
              <p className="mt-4 text-sm">
                <Link
                  href={candidateHref}
                  className="font-medium text-[var(--accent)] hover:underline"
                >
                  Open candidate in Recruit →
                </Link>
              </p>
            )}
          </div>

          <div className="card-lifted rounded-xl p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
                Recent messages
              </h2>
              <button
                type="button"
                onClick={() => void refetchMessages({ silent: false })}
                className="text-xs font-medium text-[var(--accent)] hover:underline"
              >
                Refresh
              </button>
            </div>
            {messagesError && (
              <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
                {messagesError}
              </p>
            )}
            {messagesLoading && !messagesData ? (
              <div className="space-y-2 py-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-5/6" />
              </div>
            ) : messagesError ? null : recentMessages.length === 0 ? (
              <p className="text-sm text-white/60">
                No logged messages for this number yet. After the message log table exists, new
                inbound webhooks and outbound API sends are recorded here automatically.
              </p>
            ) : (
              <ul className="max-h-[320px] space-y-2 overflow-y-auto">
                {recentMessages.map((m) => (
                  <li key={m.id} className="card-lifted-hover rounded-lg px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/60">
                      <span>
                        {m.direction === "inbound" ? (
                          <span className="font-medium text-sky-400">In</span>
                        ) : (
                          <span className="font-medium text-emerald-400">Out</span>
                        )}
                        <span className="mx-1">·</span>
                        {m.message_type}
                        <span className="mx-1">·</span>
                        {formatDateTime(m.created_at)}
                      </span>
                      {m.wa_message_id && (
                        <span className="font-mono text-[10px] opacity-70" title={m.wa_message_id}>
                          {m.wa_message_id.slice(0, 12)}…
                        </span>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[var(--text)]">
                      {m.body_preview ?? "—"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card-lifted rounded-xl p-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/60">
              Session context (JSON)
            </h2>
            <pre className="max-h-[360px] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 font-mono text-xs text-[var(--text)]">
              {JSON.stringify(session.context ?? {}, null, 2)}
            </pre>
          </div>

          <div className="card-lifted rounded-xl p-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/60">
              Reply via TigerHire (Meta API)
            </h2>
            <p className="mb-4 text-xs text-white/60">
              Sends from your configured Cloud API / virtual business number. Outside the 24-hour
              window, Meta may deliver using the session-expired template fallback (same as other
              product sends).
            </p>
            <form onSubmit={handleSend} className="space-y-3">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={4}
                placeholder="Type a message to send to this number…"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--text)] placeholder:text-white/60"
                maxLength={4096}
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={sending || !replyText.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  Send
                </button>
                {sendNotice && <span className="text-sm text-emerald-400">{sendNotice}</span>}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
