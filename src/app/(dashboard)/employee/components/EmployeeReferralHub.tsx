"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Briefcase,
  CheckCircle2,
  ClipboardCopy,
  IndianRupee,
  Link2,
  ListFilter,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Send,
  UserPlus,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/auth/AuthProvider";
import { stagePillClass, type ReferralStageKey } from "@/lib/referrals/employee-referral-stages";

type BoardJob = {
  id: string;
  title: string;
  location: string | null;
  organisation_name: string;
  direct_bonus_amount: number;
  link: {
    link_id: string;
    apply_url: string;
    created_at: string;
    applied_count: number;
  } | null;
  whatsapp_invites: { id: string; candidate_name: string; status: string }[];
};

type DeliveryStatus = "sent" | "delivered" | "read" | "failed" | null;

type ReferralRow = {
  id: string;
  candidate_name: string;
  candidate_phone: string | null;
  job_id: string;
  job_title: string;
  channel: "whatsapp" | "link";
  stage_key: ReferralStageKey;
  stage_label: string;
  referred_at: string;
  delivery_status: DeliveryStatus;
  delivery_error: string | null;
  delivery_updated_at: string | null;
};

type BoardPayload = {
  needs_setup: boolean;
  referrer_name: string | null;
  earnings: { pending_inr: number; paid_inr: number };
  hired_count: number;
  summary?: {
    open_roles: number;
    links_created: number;
    invites_sent: number;
    in_pipeline: number;
  };
  jobs: BoardJob[];
  referrals: ReferralRow[];
};

type TabKey = "roles" | "referrals";
type ExpandMode = "link" | "invite" | null;
type ReferralFilter = "all" | "active" | "hired" | "rejected";

const COUNTRY_CODES = [
  { code: "+91", label: "India" },
  { code: "+1", label: "US/Canada" },
] as const;

function formatInr(amount: number): string {
  if (amount <= 0) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function referralShareMessage(jobTitle: string, applyUrl: string, referrerName: string): string {
  return `${referrerName} thought you'd be a great fit for ${jobTitle}. Apply here: ${applyUrl}`;
}

function DeliveryBadge({ referral }: { referral: ReferralRow }) {
  if (referral.channel !== "whatsapp") return null;
  const { delivery_status, delivery_error, delivery_updated_at } = referral;
  const tooltipParts: string[] = [];
  if (delivery_error) tooltipParts.push(delivery_error);
  if (delivery_updated_at) tooltipParts.push(`Updated ${formatDate(delivery_updated_at)}`);
  const title = tooltipParts.join(" · ") || undefined;

  const styles: Record<NonNullable<DeliveryStatus> | "pending", { cls: string; label: string }> = {
    pending: {
      cls: "border-white/15 bg-white/[0.04] text-white/55",
      label: "Pending",
    },
    sent: {
      cls: "border-sky-500/30 bg-sky-500/10 text-sky-300",
      label: "Sent",
    },
    delivered: {
      cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      label: "Delivered",
    },
    read: {
      cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
      label: "Read",
    },
    failed: {
      cls: "border-red-500/40 bg-red-500/10 text-red-300",
      label: "Failed",
    },
  };
  const key = delivery_status ?? "pending";
  const style = styles[key];
  return (
    <span
      title={title}
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${style.cls}`}
    >
      {style.label}
    </span>
  );
}

function CompactJobCard(props: {
  job: BoardJob;
  needsSetup: boolean;
  expand: ExpandMode;
  busyJobId: string | null;
  copiedJobId: string | null;
  inviteName: string;
  invitePhone: string;
  inviteSubmitting: boolean;
  onToggleExpand: (mode: ExpandMode) => void;
  onInviteNameChange: (v: string) => void;
  onInvitePhoneChange: (v: string) => void;
  onCreateLink: () => void;
  onCopyLink: () => void;
  onShareWhatsApp: () => void;
  onShareEmail: () => void;
  onSendInvite: () => void;
}) {
  const {
    job,
    needsSetup,
    expand,
    busyJobId,
    copiedJobId,
    inviteName,
    invitePhone,
    inviteSubmitting,
    onToggleExpand,
    onInviteNameChange,
    onInvitePhoneChange,
    onCreateLink,
    onCopyLink,
    onShareWhatsApp,
    onShareEmail,
    onSendInvite,
  } = props;

  return (
    <article className="card-lifted flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-[var(--text)]">{job.title}</h3>
            {job.location ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-white/50">
                <MapPin size={12} className="shrink-0" />
                <span className="truncate">{job.location}</span>
              </p>
            ) : null}
          </div>
          <span className="shrink-0 rounded-lg bg-[var(--accent)]/12 px-2 py-1 text-[10px] font-semibold text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/20">
            {formatInr(job.direct_bonus_amount)}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {job.link ? (
            <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
              Link
            </span>
          ) : null}
          {job.whatsapp_invites.length > 0 ? (
            <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
              {job.whatsapp_invites.length} invited
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onToggleExpand(expand === "link" ? null : "link")}
            className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition ${
              expand === "link"
                ? "border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)]"
                : "border-[var(--border)] bg-white/[0.03] text-white/75 hover:bg-white/[0.06]"
            }`}
          >
            <Link2 size={13} />
            Link
          </button>
          <button
            type="button"
            onClick={() => onToggleExpand(expand === "invite" ? null : "invite")}
            className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition ${
              expand === "invite"
                ? "border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)]"
                : "border-[var(--border)] bg-white/[0.03] text-white/75 hover:bg-white/[0.06]"
            }`}
          >
            <Send size={13} />
            Invite
          </button>
        </div>
      </div>

      {expand === "link" ? (
        <div className="border-t border-[var(--border)] bg-[var(--bg)]/40 px-3.5 py-3">
          {job.link ? (
            <div className="space-y-2">
              <p className="line-clamp-1 break-all text-[11px] text-white/60">
                {job.link.apply_url}
              </p>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={onCopyLink}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-white/80"
                >
                  <ClipboardCopy size={12} />
                  {copiedJobId === job.id ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={onShareWhatsApp}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-white/80"
                >
                  <MessageCircle size={12} />
                  WA
                </button>
                <button
                  type="button"
                  onClick={onShareEmail}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-white/80"
                >
                  <Mail size={12} />
                  Email
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={busyJobId === job.id || needsSetup}
              onClick={onCreateLink}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] py-2 text-xs font-semibold text-black disabled:opacity-60"
            >
              {busyJobId === job.id ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Link2 size={14} />
              )}
              Create link
            </button>
          )}
        </div>
      ) : null}

      {expand === "invite" ? (
        <div className="border-t border-[var(--border)] bg-[var(--bg)]/40 px-3.5 py-3">
          <div className="grid gap-1.5">
            <input
              type="text"
              placeholder="Name"
              value={inviteName}
              onChange={(e) => onInviteNameChange(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-xs"
            />
            <input
              type="tel"
              placeholder="9876543210 or +919876543210"
              value={invitePhone}
              onChange={(e) => onInvitePhoneChange(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-xs"
            />
            <button
              type="button"
              disabled={inviteSubmitting}
              onClick={onSendInvite}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/12 bg-white/[0.05] py-2 text-xs font-medium disabled:opacity-60"
            >
              {inviteSubmitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <UserPlus size={14} />
              )}
              Send WhatsApp invite
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ReferralsPanel(props: { referrals: ReferralRow[] }) {
  const [filter, setFilter] = useState<ReferralFilter>("all");

  const filtered = useMemo(() => {
    return props.referrals.filter((r) => {
      if (filter === "all") return true;
      if (filter === "hired") return r.stage_key === "offer";
      if (filter === "rejected") return r.stage_key === "rejected";
      return r.stage_key !== "offer" && r.stage_key !== "rejected";
    });
  }, [props.referrals, filter]);

  const filters: { id: ReferralFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "active", label: "In progress" },
    { id: "hired", label: "Hired" },
    { id: "rejected", label: "Rejected" },
  ];

  if (props.referrals.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border)] px-6 py-14 text-center text-sm text-white/55">
        No referrals yet. Open a role and share your link or send a WhatsApp invite.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ListFilter size={14} className="text-white/45" />
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === f.id
                ? "bg-[var(--accent)] text-black"
                : "border border-[var(--border)] bg-white/[0.03] text-white/65 hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-white/45">{filtered.length} shown</span>
      </div>

      <ul className="space-y-2" role="list">
        {filtered.map((r) => (
          <li
            key={r.id}
            className="card-lifted flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--text)]">{r.candidate_name}</p>
              <p className="mt-0.5 truncate text-xs text-white/55">
                {r.job_title}
                {r.candidate_phone ? ` · ${r.candidate_phone}` : ""}
              </p>
              <p className="mt-1 text-[11px] text-white/40">Referred {formatDate(r.referred_at)}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                  r.channel === "link"
                    ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
                    : "border-sky-500/30 bg-sky-500/10 text-sky-300"
                }`}
              >
                {r.channel === "link" ? "Link" : "WhatsApp"}
              </span>
              <DeliveryBadge referral={r} />
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${stagePillClass(r.stage_key)}`}
              >
                {r.stage_label}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EmployeeReferralHub() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const tabParam = searchParams.get("tab");
  const activeTab: TabKey = tabParam === "referrals" ? "referrals" : "roles";

  const [board, setBoard] = useState<BoardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);
  const [expandByJob, setExpandByJob] = useState<Record<string, ExpandMode>>({});

  const [inviteName, setInviteName] = useState<Record<string, string>>({});
  const [invitePhone, setInvitePhone] = useState<Record<string, string>>({});
  const [inviteSubmitting, setInviteSubmitting] = useState<string | null>(null);

  const [setupCountryCode, setSetupCountryCode] =
    useState<(typeof COUNTRY_CODES)[number]["code"]>("+91");
  const [setupLocalWhatsapp, setSetupLocalWhatsapp] = useState("");
  const [setupOtp, setSetupOtp] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const setTab = useCallback(
    (tab: TabKey) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "roles") params.delete("tab");
      else params.set("tab", tab);
      const q = params.toString();
      router.replace(q ? `/employee?${q}` : "/employee", { scroll: false });
    },
    [router, searchParams],
  );

  const loadBoard = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/employees/referral-board", { credentials: "include" });
    const json = (await res.json().catch(() => ({}))) as BoardPayload & { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Could not load.");
      return null;
    }
    setBoard({ ...json, referrals: json.referrals ?? [] });
    return json;
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadBoard();
      setLoading(false);
    })();
  }, [loadBoard]);

  const firstName = user?.name?.split(" ")[0] ?? "";
  const referrerDisplayName = board?.referrer_name ?? user?.name ?? "You";

  function toggleExpand(jobId: string, mode: ExpandMode) {
    setExpandByJob((prev) => {
      const current = prev[jobId] ?? null;
      const next = current === mode ? null : mode;
      return { ...prev, [jobId]: next };
    });
  }

  async function copyLink(jobId: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedJobId(jobId);
      setTimeout(() => setCopiedJobId(null), 1600);
    } catch {
      setNotice({ tone: "err", text: "Could not copy link." });
    }
  }

  async function createLink(jobId: string) {
    setBusyJobId(jobId);
    setNotice(null);
    try {
      const res = await fetch("/api/refer/links/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_ids: [jobId] }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        needs_setup?: boolean;
        error?: string;
        links?: { job_id: string; apply_url: string }[];
        existing_links?: { job_id: string; apply_url: string }[];
      };
      if (json.needs_setup) {
        setNotice({ tone: "err", text: "Verify WhatsApp first to create links." });
        return;
      }
      if (!res.ok) {
        setNotice({ tone: "err", text: json.error ?? "Could not create link." });
        return;
      }
      const url =
        json.links?.find((l) => l.job_id === jobId)?.apply_url ??
        json.existing_links?.find((l) => l.job_id === jobId)?.apply_url;
      if (url) await copyLink(jobId, url);
      setNotice({ tone: "ok", text: "Link created and copied." });
      await loadBoard();
      setExpandByJob((p) => ({ ...p, [jobId]: "link" }));
    } finally {
      setBusyJobId(null);
    }
  }

  async function startSetupOtp() {
    setSetupError(null);
    setSetupSubmitting(true);
    try {
      const whatsapp = `${setupCountryCode}${setupLocalWhatsapp.replace(/\D/g, "")}`;
      await fetch("/api/refer/join", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp_number: whatsapp }),
      });
      const res = await fetch("/api/refer/otp/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp_number: whatsapp }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSetupError(json.error ?? "Could not send OTP.");
        return;
      }
      setOtpRequested(true);
    } finally {
      setSetupSubmitting(false);
    }
  }

  async function verifySetupOtp() {
    setSetupError(null);
    setSetupSubmitting(true);
    try {
      const whatsapp = `${setupCountryCode}${setupLocalWhatsapp.replace(/\D/g, "")}`;
      const res = await fetch("/api/refer/otp/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsapp_number: whatsapp,
          otp_code: setupOtp.trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; verified?: boolean };
      if (!res.ok || !json.verified) {
        setSetupError(json.error ?? "Invalid OTP.");
        return;
      }
      setOtpRequested(false);
      setSetupOtp("");
      setNotice({ tone: "ok", text: "Verified." });
      await loadBoard();
    } finally {
      setSetupSubmitting(false);
    }
  }

  async function sendWhatsAppInvite(jobId: string) {
    const name = (inviteName[jobId] ?? "").trim();
    const phone = (invitePhone[jobId] ?? "").trim();
    if (!name || !phone) {
      setNotice({ tone: "err", text: "Enter name and phone." });
      return;
    }
    setInviteSubmitting(jobId);
    setNotice(null);
    try {
      const res = await fetch("/api/employees/refer", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          candidate_name: name,
          candidate_phone: phone,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        whatsapp?: { reached?: boolean; error?: string | null };
      };
      if (!res.ok) {
        setNotice({ tone: "err", text: json.error ?? "Could not send invite." });
        return;
      }
      setInviteName((p) => ({ ...p, [jobId]: "" }));
      setInvitePhone((p) => ({ ...p, [jobId]: "" }));
      if (json.whatsapp?.reached) {
        setNotice({
          tone: "ok",
          text: "WhatsApp invite submitted — delivery will update on the referral card.",
        });
      } else {
        setNotice({
          tone: "err",
          text: "Referral saved, but WhatsApp did not confirm delivery. Use +91 and a 10-digit mobile number; on local dev check WHATSAPP_MODE is not sandbox and Meta credentials are set.",
        });
      }
      await loadBoard();
      setTab("referrals");
    } finally {
      setInviteSubmitting(null);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Refer colleagues" subtitle="Loading…" />
        <div className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Refer & Earn${firstName ? `, ${firstName}` : ""}`}
        subtitle="Share links or send WhatsApp invites — track every referral in one place."
      />

      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            notice.tone === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      {board?.needs_setup ? (
        <section className="card-lifted max-w-md p-5">
          <h2 className="text-base font-semibold">Verify WhatsApp</h2>
          <p className="mt-1 text-sm text-white/55">Needed for personal referral links.</p>
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <select
                value={setupCountryCode}
                onChange={(e) =>
                  setSetupCountryCode(e.target.value as (typeof COUNTRY_CODES)[number]["code"])
                }
                className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                value={setupLocalWhatsapp}
                onChange={(e) => setSetupLocalWhatsapp(e.target.value.replace(/\D/g, ""))}
                placeholder="9876543210"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm"
              />
            </div>
            {otpRequested ? (
              <input
                inputMode="numeric"
                value={setupOtp}
                onChange={(e) => setSetupOtp(e.target.value)}
                placeholder="OTP"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm"
              />
            ) : null}
            {setupError ? <p className="text-sm text-red-300">{setupError}</p> : null}
            <button
              type="button"
              disabled={setupSubmitting}
              onClick={otpRequested ? verifySetupOtp : startSetupOtp}
              className="w-full rounded-lg bg-[var(--accent)] py-2 text-sm font-semibold text-black disabled:opacity-60"
            >
              {setupSubmitting ? "…" : otpRequested ? "Verify" : "Send OTP"}
            </button>
          </div>
        </section>
      ) : board ? (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              { label: "Pending", value: formatInr(board.earnings.pending_inr), icon: IndianRupee },
              { label: "Paid", value: formatInr(board.earnings.paid_inr), icon: CheckCircle2 },
              {
                label: "In pipeline",
                value: String(board.summary?.in_pipeline ?? 0),
                icon: Users,
              },
              { label: "Hired", value: String(board.hired_count), icon: Briefcase },
            ].map((stat) => (
              <div key={stat.label} className="card-lifted flex items-center gap-2.5 p-3">
                <stat.icon size={16} className="shrink-0 text-[var(--accent)]" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-white/50">{stat.label}</p>
                  <p className="text-sm font-semibold tabular-nums">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)]/50 p-1">
            {(
              [
                { id: "roles" as const, label: "Open roles", count: board.jobs.length },
                {
                  id: "referrals" as const,
                  label: "My referrals",
                  count: board.referrals.length,
                },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition ${
                  activeTab === t.id
                    ? "bg-white/[0.08] text-[var(--text)] shadow-sm"
                    : "text-white/55 hover:text-white/80"
                }`}
              >
                {t.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                    activeTab === t.id
                      ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                      : "bg-white/10"
                  }`}
                >
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {activeTab === "roles" ? (
            <section>
              {!board.jobs.length ? (
                <p className="py-10 text-center text-sm text-white/55">No open roles right now.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {board.jobs.map((job) => (
                    <CompactJobCard
                      key={job.id}
                      job={job}
                      needsSetup={Boolean(board.needs_setup)}
                      expand={expandByJob[job.id] ?? null}
                      busyJobId={busyJobId}
                      copiedJobId={copiedJobId}
                      inviteName={inviteName[job.id] ?? ""}
                      invitePhone={invitePhone[job.id] ?? ""}
                      inviteSubmitting={inviteSubmitting === job.id}
                      onToggleExpand={(mode) => toggleExpand(job.id, mode)}
                      onInviteNameChange={(v) => setInviteName((p) => ({ ...p, [job.id]: v }))}
                      onInvitePhoneChange={(v) => setInvitePhone((p) => ({ ...p, [job.id]: v }))}
                      onCreateLink={() => void createLink(job.id)}
                      onCopyLink={() => void copyLink(job.id, job.link!.apply_url)}
                      onShareWhatsApp={() => {
                        if (!job.link?.apply_url) return;
                        const text = referralShareMessage(
                          job.title,
                          job.link.apply_url,
                          referrerDisplayName,
                        );
                        window.open(
                          `https://wa.me/?text=${encodeURIComponent(text)}`,
                          "_blank",
                          "noopener,noreferrer",
                        );
                      }}
                      onShareEmail={() => {
                        if (!job.link?.apply_url) return;
                        const subject = `Referral: ${job.title}`;
                        const body = referralShareMessage(
                          job.title,
                          job.link.apply_url,
                          referrerDisplayName,
                        );
                        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                      }}
                      onSendInvite={() => void sendWhatsAppInvite(job.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : (
            <ReferralsPanel referrals={board.referrals} />
          )}
        </>
      ) : null}
    </div>
  );
}
