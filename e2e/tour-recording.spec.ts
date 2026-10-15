import { expect, test } from "@playwright/test";
import path from "node:path";
import { loginWithFallback } from "./helpers/login";
import { applyPagePath } from "./helpers/apply-slug";
import { gotoRoute } from "./helpers/navigation";

test.use({
  viewport: { width: 1600, height: 1000 },
  video: "on",
});

test.describe("90-second tour recording", () => {
  test("captures product walkthrough scenes", async ({ page, request }, testInfo) => {
    test.setTimeout(360_000);
    console.log("tour-video config:", testInfo.project.use.video);
    console.log("tour-page-has-video:", Boolean(page.video()));

    const hold = async (ms: number) => {
      await page.waitForTimeout(ms);
    };

    await test.step("seed demo users and finstack baseline", async () => {
      await request.get("/api/auth/seed-demo-users");
      await request.post("/api/seed/finstack");
    });

    await test.step("login as recruiter", async () => {
      await loginWithFallback(page, {
        email: "rajiv.menon@finstack.in",
        buttonName: /recruiter/i,
        expectedPath: /\/recruit/,
      });
      await expect(page.locator("body")).toBeVisible();
      await hold(1200);
    });

    await test.step("scene 1: applications inbox overload", async () => {
      await gotoRoute(page, "/recruit/applications");
      await expect(page.locator("main, body").first()).toBeVisible();
      await hold(1200);
      for (let i = 0; i < 6; i += 1) {
        await page.mouse.wheel(0, 1300);
        await hold(220);
      }
      for (let i = 0; i < 3; i += 1) {
        await page.mouse.wheel(0, -1200);
        await hold(220);
      }
      await hold(1300);
    });

    await test.step("scene 2 + 3: job shortlist and verdict details", async () => {
      const targetJobId = await page.evaluate(async () => {
        const res = await fetch("/api/jobs?status=open&limit=30&page=1", {
          credentials: "include",
        });
        if (!res.ok) return "";
        const json = (await res.json()) as { jobs?: Array<{ id: string; title?: string }> };
        const jobs = json.jobs ?? [];
        const seeded =
          jobs.find((job) => (job.title ?? "").includes("[Seed] Senior Full Stack Engineer")) ??
          jobs.find((job) => (job.title ?? "").includes("[Seed]")) ??
          jobs[0];
        return seeded?.id ?? "";
      });
      expect(targetJobId).toBeTruthy();
      await gotoRoute(page, `/recruit/jobs/${targetJobId}/matches`);
      await page.waitForURL(/\/recruit\/jobs\/[^/]+\/matches/);
      await expect(page.getByText(/shortlist|fitscore|fit score|view score/i).first()).toBeVisible({
        timeout: 20_000,
      });
      await hold(1000);

      const firstViewScore = page.getByText(/view score/i).first();
      await expect(firstViewScore).toBeVisible({ timeout: 20_000 });
      await firstViewScore.click();
      await page.waitForURL(/\/recruit\/candidates\/.+#scores|\/recruit\/candidates\/.+/);
      await expect(page.getByRole("heading", { name: /scores/i })).toBeVisible({
        timeout: 20_000,
      });

      await hold(1200);
      await page.mouse.wheel(0, 600);
      await hold(700);

      const evidenceToggle = page.getByText(/evidence from cv/i).first();
      if (await evidenceToggle.isVisible().catch(() => false)) {
        await evidenceToggle.click();
        await hold(900);
      }

      const whyVerdict = page.getByText(/why this verdict/i).first();
      if (await whyVerdict.isVisible().catch(() => false)) {
        await whyVerdict.scrollIntoViewIfNeeded();
        await hold(900);
      }

      const timelineHeading = page.getByText(/activity & messages/i).first();
      if (await timelineHeading.isVisible().catch(() => false)) {
        await timelineHeading.scrollIntoViewIfNeeded();
        await hold(700);
        const messagesFilter = page.getByRole("tab", { name: /messages/i }).first();
        if (await messagesFilter.isVisible().catch(() => false)) {
          await messagesFilter.click();
          await hold(900);
        }
        const waEvent = page.getByText(/whatsapp \\(outbound\\)|whatsapp \\(inbound\\)/i).first();
        if (await waEvent.isVisible().catch(() => false)) {
          await waEvent.scrollIntoViewIfNeeded();
          await hold(1200);
        }
      }
    });

    await test.step("scene 4: apply page whatsapp touchpoints", async () => {
      await gotoRoute(page, applyPagePath());
      await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
      const waShare = page.getByRole("link", { name: /send apply link via whatsapp/i }).first();
      if (await waShare.isVisible().catch(() => false)) {
        await waShare.scrollIntoViewIfNeeded();
        await hold(1100);
      }
      const waOptIn = page.getByText(/message me on whatsapp about this application/i).first();
      if (await waOptIn.isVisible().catch(() => false)) {
        await waOptIn.scrollIntoViewIfNeeded();
        await hold(1000);
      }
    });

    await test.step("scene 5: whatsapp-first candidate intake page", async () => {
      await gotoRoute(page, "/candidates");
      await expect(page.getByText(/apply on whatsapp|drop cv on whatsapp/i).first()).toBeVisible({
        timeout: 20_000,
      });
      await hold(1200);
      await page.mouse.wheel(0, 900);
      await hold(900);
      await page.mouse.wheel(0, 900);
      await hold(900);
    });

    await test.step("scene 6: kanban pipeline board", async () => {
      await gotoRoute(page, "/recruit/pipeline");
      await expect(page.getByRole("heading", { name: /pipeline/i })).toBeVisible({
        timeout: 20_000,
      });
      await hold(1200);

      const byJobButton = page.getByRole("button", { name: /by job/i }).first();
      if (await byJobButton.isVisible().catch(() => false)) {
        await byJobButton.click();
        await hold(900);
      }
      await page.mouse.wheel(0, 900);
      await hold(900);
      await page.mouse.wheel(0, -700);
      await hold(900);
    });

    await test.step("scene 7: homepage close / CTA", async () => {
      await gotoRoute(page, "/");
      await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });
      await hold(1800);
    });

    await test.step("export stable video artifact", async () => {
      const video = page.video();
      await page.close();
      if (!video) return;
      const outputPath = path.join(process.cwd(), "tour-latest.webm");
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          await video.saveAs(outputPath);
          console.log(`Tour recording saved to: ${outputPath}`);
          return;
        } catch (error) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    });
  });
});
