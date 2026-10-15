"use client";

import { useApiQuery } from "@/lib/hooks/use-api";

export function IdibuJobBoardSetupHint({ organisationId }: { organisationId: string }) {
  const { data } = useApiQuery<{
    configured?: boolean;
    postingReady?: boolean;
    webhookUrl?: string | null;
  }>("/api/idibu/status");
  if (!data?.configured || !data.webhookUrl) return null;

  return (
    <div className="space-y-2">
      <p>
        <span className="font-medium text-violet-100">Webhook URL</span> — paste this in idibu
        (Settings → Webhooks):
      </p>
      <code className="block break-all rounded-md bg-black/30 px-2 py-1.5 text-[11px] text-violet-50">
        {data.webhookUrl}
      </code>
      <p className="text-violet-200/70">
        Required: <span className="font-medium">App ID</span>,{" "}
        <span className="font-medium">App Secret</span>, and{" "}
        <span className="font-medium">Webhook secret</span> (same value in idibu). Integration name
        and default sector are optional unless you use Post to Job Boards.
      </p>
      {!data.postingReady ? (
        <p className="text-violet-200/70">
          To post jobs from TigerHire, also add{" "}
          <span className="font-medium">Integration name</span> (idibu posting slug).
        </p>
      ) : (
        <p className="text-violet-200/70">
          Vacancy reference must be the TigerHire job UUID when posting from the job page.
        </p>
      )}
      <p className="text-violet-200/70">Organisation ID: {organisationId}</p>
    </div>
  );
}
