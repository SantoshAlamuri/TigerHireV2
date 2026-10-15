import { test, expect } from "@playwright/test";
import { loginWithFallback } from "./helpers/login";
import { gotoRoute } from "./helpers/navigation";

/**
 * Verifies that pages using recharts (admin overview, recruit analytics) do not
 * trigger CSP violations. Recharts 3.7.0 and victory-vendor do not use eval/new Function,
 * so script-src without 'unsafe-eval' is sufficient.
 */
test.describe("CSP compatibility with recharts", () => {
  test("analytics page with recharts loads without CSP console errors", async ({ page }) => {
    const cspErrors: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      const type = msg.type();
      if (
        type === "error" &&
        /Content Security Policy|Refused to execute|unsafe-eval|EvalError/.test(text)
      ) {
        cspErrors.push(text);
      }
    });

    await loginWithFallback(page, {
      email: "rajiv.menon@finstack.in",
      buttonName: /recruiter/i,
      expectedPath: /\/recruit/,
    });
    const recruitRedirected = page.url().includes("/recruit");

    if (!recruitRedirected) {
      test.skip(!recruitRedirected, "Demo recruiter login not available (seed users required)");
      return;
    }

    await gotoRoute(page, "/recruit/analytics");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("heading", { name: /analytics/i })).toBeVisible({
      timeout: 15000,
    });
    // Recharts renders chart SVGs under `.recharts-wrapper`; avoid matching hidden icon SVGs.
    await expect(page.locator(".recharts-wrapper svg").first()).toBeVisible({ timeout: 5000 });

    expect(cspErrors).toEqual([]);
  });
});
