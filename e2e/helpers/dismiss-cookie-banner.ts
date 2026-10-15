import type { Page } from "@playwright/test";

/** Dismiss cookie consent so it does not block clicks in E2E. */
export async function dismissCookieBanner(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: /cookie consent/i });
  // Consent mounts after hydration; an immediate visibility check can race it.
  await dialog.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  if (!(await dialog.isVisible().catch(() => false))) return;

  const btn = dialog.getByRole("button", { name: "Essential only", exact: true });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await dialog.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  }
}
