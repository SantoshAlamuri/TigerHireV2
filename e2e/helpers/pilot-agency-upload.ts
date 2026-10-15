import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const FIXTURE = path.join(__dirname, "../fixtures/sample-resume.pdf");

/** Bulk upload via in-page fetch (Playwright multipart arrays are unreliable for repeated `files`). */
export async function agencyBulkUploadViaPage(
  page: Page,
  opts: { clientOrgId: string; jobId: string; fileCount?: number },
): Promise<{ ok: boolean; successCount: number; status: number }> {
  const fileCount = opts.fileCount ?? 3;
  const buffer = fs.readFileSync(FIXTURE);
  const base64 = buffer.toString("base64");

  const result = await page.evaluate(
    async ({ clientOrgId, jobId, b64, count }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const form = new FormData();
      form.append("clientOrgId", clientOrgId);
      form.append("jobId", jobId);
      for (let i = 0; i < count; i += 1) {
        form.append(
          "files",
          new File([bytes], `pilot-bulk-${i + 1}.pdf`, { type: "application/pdf" }),
        );
      }
      const res = await fetch("/api/agency/upload-profile/bulk", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { results?: Array<{ success?: boolean }> };
        results?: Array<{ success?: boolean }>;
      };
      const results = json.data?.results ?? json.results ?? [];
      const successCount = results.filter((r) => r.success).length;
      return { ok: res.ok && successCount > 0, successCount, status: res.status };
    },
    {
      clientOrgId: opts.clientOrgId,
      jobId: opts.jobId,
      b64: base64,
      count: fileCount,
    },
  );

  return result;
}
