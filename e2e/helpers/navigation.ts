import type { Page } from "@playwright/test";

interface GotoRouteOptions {
  timeoutMs?: number;
  attempts?: number;
}

export async function gotoRoute(page: Page, path: string, opts: GotoRouteOptions = {}) {
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const attempts = opts.attempts ?? 2;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      await page.waitForTimeout(300);
    }
  }

  throw lastError;
}
