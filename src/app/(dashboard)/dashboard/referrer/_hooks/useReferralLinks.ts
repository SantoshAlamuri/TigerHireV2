"use client";

import { useState } from "react";
import { inviteJoinUrl } from "../_lib/helpers";
import type {
  LinkActionMessage,
  LoadDashboardResult,
  OpenJobRow,
  ReferProfilePayload,
} from "../_lib/types";

type UseReferralLinksArgs = {
  loadDashboard: () => Promise<LoadDashboardResult>;
  setData: (data: ReferProfilePayload) => void;
  linkedJobIdSet: Set<string>;
};

export function useReferralLinks({ loadDashboard, setData, linkedJobIdSet }: UseReferralLinksArgs) {
  const [copied, setCopied] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [openJobs, setOpenJobs] = useState<OpenJobRow[]>([]);
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [linkBusyJobId, setLinkBusyJobId] = useState<string | null>(null);
  const [renewBusyLinkId, setRenewBusyLinkId] = useState<string | null>(null);
  const [linkActionMessage, setLinkActionMessage] = useState<LinkActionMessage | null>(null);

  async function copyUrl(key: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* no-op */
    }
  }

  async function copyInviteLink(parentReferrerId: string) {
    try {
      await navigator.clipboard.writeText(inviteJoinUrl(parentReferrerId));
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 1800);
    } catch {
      setLinkActionMessage({
        tone: "error",
        text: "Could not copy invite link. Please try again.",
      });
    }
  }

  async function loadOpenJobs() {
    setLinkActionMessage(null);
    setJobsLoading(true);
    try {
      const res = await fetch("/api/refer/jobs/open", { credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json()) as { jobs?: OpenJobRow[] };
      setOpenJobs(json.jobs ?? []);
      setShowJobPicker(true);
    } finally {
      setJobsLoading(false);
    }
  }

  async function renewReferralLink(linkId: string, jobId: string) {
    setLinkActionMessage(null);
    setRenewBusyLinkId(linkId);
    try {
      const res = await fetch("/api/refer/links/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_ids: [jobId], refresh: true }),
      });
      const json = (await res.json()) as {
        needs_setup?: boolean;
        error?: string;
        refreshed_links?: { job_id: string }[];
        closed_jobs?: { job_id: string; job_title: string }[];
      };
      if (json.needs_setup) {
        setLinkActionMessage({
          tone: "error",
          text: "Set up your referrer profile first (WhatsApp verification).",
        });
        return;
      }
      if (!res.ok) {
        setLinkActionMessage({
          tone: "error",
          text: json.error ?? "Could not renew this link.",
        });
        return;
      }
      const closed = json.closed_jobs?.find((c) => c.job_id === jobId);
      if (closed) {
        setLinkActionMessage({
          tone: "error",
          text: `"${closed.job_title}" is closed — links cannot be renewed.`,
        });
        return;
      }
      const wasRefreshed = json.refreshed_links?.some((r) => r.job_id === jobId) ?? false;
      setLinkActionMessage({
        tone: "info",
        text: wasRefreshed
          ? "Expiry extended. Same URL and token — resharing is optional."
          : "Link updated. Check the new valid-until date below.",
      });
      const next = await loadDashboard();
      if (next && !next.needsSetup) setData(next.data);
    } finally {
      setRenewBusyLinkId(null);
    }
  }

  async function generateSingleJobLink(jobId: string) {
    if (linkedJobIdSet.has(jobId)) return;
    setLinkActionMessage(null);
    setLinkBusyJobId(jobId);
    try {
      const res = await fetch("/api/refer/links/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_ids: [jobId] }),
      });
      const json = (await res.json()) as {
        needs_setup?: boolean;
        error?: string;
        links?: { job_id: string; apply_url: string; job_title: string }[];
        existing_links?: { job_id: string; apply_url: string; job_title: string }[];
        closed_jobs?: { job_id: string; job_title: string }[];
      };
      if (json.needs_setup) {
        setLinkActionMessage({
          tone: "error",
          text: "Set up your referrer profile first (WhatsApp verification).",
        });
        return;
      }
      if (!res.ok) {
        setLinkActionMessage({
          tone: "error",
          text: json.error ?? "Could not create a referral link.",
        });
        return;
      }
      const closed = json.closed_jobs?.find((c) => c.job_id === jobId);
      if (closed) {
        setLinkActionMessage({
          tone: "error",
          text: `"${closed.job_title}" is closed. You cannot create a new referral link for a closed role.`,
        });
        return;
      }
      const existing = json.existing_links?.find((e) => e.job_id === jobId);
      if (existing?.apply_url) {
        try {
          await navigator.clipboard.writeText(existing.apply_url);
        } catch {
          /* no-op */
        }
        setCopied(`new-${jobId}`);
        setTimeout(() => setCopied(null), 1600);
        setLinkActionMessage({
          tone: "info",
          text: "You already have a referral link for this role — it cannot be recreated. The same link was copied again; it also appears under My Links.",
        });
        const refreshed = await loadDashboard();
        if (refreshed && !refreshed.needsSetup) setData(refreshed.data);
        return;
      }
      const generated = json.links?.find((l) => l.job_id === jobId);
      if (generated?.apply_url) {
        try {
          await navigator.clipboard.writeText(generated.apply_url);
        } catch {
          /* no-op */
        }
        setCopied(`new-${jobId}`);
        setTimeout(() => setCopied(null), 1600);
        setLinkActionMessage({
          tone: "info",
          text: "New referral link created and copied. This link is fixed for this role — use My Links if you need it again.",
        });
        const refreshed = await loadDashboard();
        if (refreshed && !refreshed.needsSetup) setData(refreshed.data);
        return;
      }
      setLinkActionMessage({
        tone: "error",
        text: "Unexpected response from the server. Please try again.",
      });
    } finally {
      setLinkBusyJobId(null);
    }
  }

  return {
    copied,
    inviteCopied,
    jobsLoading,
    openJobs,
    showJobPicker,
    linkBusyJobId,
    renewBusyLinkId,
    linkActionMessage,
    copyUrl,
    copyInviteLink,
    loadOpenJobs,
    renewReferralLink,
    generateSingleJobLink,
  };
}
