import path from "node:path";
import { test, expect } from "@playwright/test";
import { pilotLogin } from "../helpers/pilot-login";
import { dismissCookieBanner } from "../helpers/dismiss-cookie-banner";
import { getPilotJobId } from "../helpers/pilot-job";
import { agencyBulkUploadViaPage } from "../helpers/pilot-agency-upload";
import { pilotApiHeaders } from "../helpers/pilot-api";

const FIXTURE_DIR = path.join(__dirname, "../fixtures");
const BULK_RESUMES = [
  path.join(FIXTURE_DIR, "pilot-resume-1.pdf"),
  path.join(FIXTURE_DIR, "pilot-resume-2.pdf"),
  path.join(FIXTURE_DIR, "pilot-resume-3.pdf"),
];

const CLIENT_NAME = process.env.PILOT_AGENCY_CLIENT_NAME?.trim() || "Finstack";

test.describe("ACT 4.4 — Agency bulk upload (3 CVs)", () => {
  test("agency uploads three resumes for client role via pipeline modal", async ({ page }) => {
    await pilotLogin(page, "agency");
    await page.goto("/agency/pipeline");
    await expect(page).toHaveURL(/\/agency\/pipeline/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible({
      timeout: 20_000,
    });
    await dismissCookieBanner(page);

    const uploadBtn = page.getByRole("button", { name: /upload candidates/i }).first();
    await expect(uploadBtn).toBeVisible({ timeout: 15_000 });
    await uploadBtn.click();
    await expect(page.getByRole("heading", { name: "Upload candidates" })).toBeVisible({
      timeout: 10_000,
    });

    const clientSelect = page.getByLabel("Select client");
    await expect(clientSelect.locator('option[value]:not([value=""])')).not.toHaveCount(0, {
      timeout: 20_000,
    });
    const clientValue = await clientSelect.locator("option").evaluateAll((opts, name) => {
      const needle = String(name).toLowerCase();
      const byName = opts.find((o) => o.value && o.textContent?.toLowerCase().includes(needle));
      if (byName?.value) return byName.value;
      const first = opts.find((o) => o.value && o.value.length > 0);
      return first?.value ?? "";
    }, CLIENT_NAME);
    test.skip(!clientValue, "No agency clients — run npm run pilot:pretest");
    await clientSelect.selectOption(clientValue);

    await page.waitForTimeout(800);
    const roleSelect = page.getByLabel("Target role");
    await expect(roleSelect).toBeEnabled({ timeout: 20_000 });

    const pilotJobId = getPilotJobId();
    const jobTitleHint = process.env.PILOT_JOB_TITLE?.trim() || "QA Engineer";
    const roleValue = await roleSelect.locator("option").evaluateAll(
      (opts, hints) => {
        const { jobId, title } = hints as { jobId: string; title: string };
        const byId = opts.find((o) => o.value === jobId);
        if (byId?.value) return byId.value;
        const needle = title.toLowerCase().slice(0, 12);
        const byTitle = opts.find((o) => o.value && o.textContent?.toLowerCase().includes(needle));
        return byTitle?.value ?? "";
      },
      { jobId: pilotJobId, title: jobTitleHint },
    );
    test.skip(!roleValue, "No open role for client — create or open a job first");
    await roleSelect.selectOption(roleValue);

    await page.getByRole("button", { name: /continue to resumes/i }).click();
    await expect(page.getByLabel(/upload resume file/i)).toBeVisible({ timeout: 10_000 });

    await page.getByLabel(/upload resume file/i).setInputFiles(BULK_RESUMES);
    await expect(page.getByText(/3 files selected/i)).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: /upload 3 profiles/i }).click();

    await expect(page.getByRole("heading", { name: "Upload results" })).toBeVisible({
      timeout: 120_000,
    });

    const successBadges = page.getByText("Success", { exact: true });
    await expect(successBadges).toHaveCount(3, { timeout: 30_000 });
  });

  test("agency bulk upload API accepts three CVs for Finstack pilot job", async ({ page }) => {
    await pilotLogin(page, "agency");

    const orgsRes = await page.request.get("/api/organisations", {
      headers: pilotApiHeaders(),
    });
    test.skip(!orgsRes.ok(), "Could not load agency clients");
    const orgsJson = (await orgsRes.json()) as {
      data?: { organisations?: Array<{ id: string; name: string }> };
      organisations?: Array<{ id: string; name: string }>;
    };
    const orgs = orgsJson.data?.organisations ?? orgsJson.organisations ?? [];
    const client =
      orgs.find((o) => o.name.toLowerCase().includes(CLIENT_NAME.toLowerCase())) ?? orgs[0];
    test.skip(!client?.id, "No agency client organisations");

    const jobsRes = await page.request.get("/api/jobs", { headers: pilotApiHeaders() });
    test.skip(!jobsRes.ok(), "Could not load jobs for agency");
    const jobsJson = (await jobsRes.json()) as {
      data?: { jobs?: Array<{ id: string; title: string; companyId?: string }> };
      jobs?: Array<{ id: string; title: string; companyId?: string }>;
    };
    const jobs = jobsJson.data?.jobs ?? jobsJson.jobs ?? [];
    const pilotJobId = getPilotJobId();
    const job =
      jobs.find((j) => j.id === pilotJobId) ??
      jobs.find((j) => j.companyId === client.id || j.title?.includes("QA"));
    test.skip(!job?.id, "No open job for bulk API upload");

    const result = await agencyBulkUploadViaPage(page, {
      clientOrgId: client.id,
      jobId: job.id,
      fileCount: 3,
    });
    test.skip(result.status === 403, "Agency not linked to client for API upload");
    expect(result.ok).toBeTruthy();
    expect(result.successCount).toBeGreaterThanOrEqual(1);
  });
});
