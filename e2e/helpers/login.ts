import type { Page } from "@playwright/test";
import { gotoRoute } from "./navigation";

interface LoginOptions {
  email: string;
  expectedPath: RegExp;
  buttonName: RegExp;
  password?: string;
}

function inferFallbackPath(expectedPath: RegExp): string | null {
  const pattern = expectedPath.source;
  if (pattern.includes("admin")) return "/admin";
  if (pattern.includes("agency")) return "/agency";
  if (pattern.includes("recruit")) return "/recruit";
  if (pattern.includes("company")) return "/company";
  if (pattern.includes("candidate")) return "/candidate";
  return null;
}

function defaultE2ePassword(): string {
  return process.env.PILOT_PASSWORD ?? process.env.SEED_DEMO_PASSWORD ?? "demo123";
}

export async function loginWithFallback(page: Page, opts: LoginOptions) {
  const { email, expectedPath, buttonName, password = defaultE2ePassword() } = opts;

  await gotoRoute(page, "/login");

  const setupDemoUsers = page.getByRole("button", { name: /setup demo users/i }).first();
  if (await setupDemoUsers.isVisible().catch(() => false)) {
    await setupDemoUsers.click().catch(() => {});
  }

  const testAccountButton = page.getByRole("button", { name: buttonName }).first();
  let usedTestAccountButton = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const testButtonVisible = await testAccountButton.isVisible().catch(() => false);
    if (testButtonVisible) {
      await testAccountButton.click();
      usedTestAccountButton = true;
      break;
    }
    await page.waitForTimeout(400);
  }

  if (!usedTestAccountButton) {
    await page.getByLabel("Email").fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
  } else {
    // Some environments trigger a delayed redirect after one-click test login.
    await page.waitForTimeout(250);
  }

  // One-click demo login can fail silently; retry with manual credentials when needed.
  if (!expectedPath.test(page.url())) {
    try {
      await page.waitForURL(expectedPath, { timeout: 10_000, waitUntil: "commit" });
    } catch {
      const emailInput = page.getByLabel("Email").first();
      if (await emailInput.isVisible().catch(() => false)) {
        await emailInput.fill(email);
        await page.locator('input[name="password"]').fill(password);
        await page.getByRole("button", { name: /sign in/i }).click();
      }
    }
  }

  if (!expectedPath.test(page.url())) {
    try {
      await page.waitForURL(expectedPath, { timeout: 20_000, waitUntil: "commit" });
    } catch {
      const fallbackPath = inferFallbackPath(expectedPath);
      if (fallbackPath) {
        await gotoRoute(page, fallbackPath, { attempts: 1, timeoutMs: 20_000 });
      }
    }
  }

  // Caller specs decide whether lack of seeded account is skippable.
}

/**
 * Can one-click test login work in this environment at all?
 *
 * `loginWithFallback` above swallows every failure by design — it retries, then
 * navigates to the section anyway and lets the caller judge. That makes
 * `try { await loginWithFallback(...) } catch { test.skip() }` dead code: the
 * call never throws, so the skip never fires and the spec fails on a bare URL
 * assertion instead, reporting "expected /company, received /login" with no hint
 * that the environment simply has no password to sign in with.
 *
 * So the caller has to ask instead of catching. `GET /api/auth/test-login`
 * answers `{ configured }` — false when SEED_DEMO_PASSWORD is missing, and 404
 * on production where the endpoint does not exist. Use it to skip ONLY the
 * unconfigured case: a configured environment that still cannot sign in is a
 * real failure and must stay red.
 *
 * Note the asymmetry in the error paths. An explicit answer is believed either
 * way, but a request that could not be made at all reports CONFIGURED — a cold
 * dev server that has not finished compiling will time out here, and answering
 * "not configured" would turn a slow start into a silent skip. Every ambiguous
 * case resolves toward failing loudly; only a definite "no password here" skips.
 */
export async function isTestLoginConfigured(page: Page): Promise<boolean> {
  // Ask the environment before asking the server, because in CI the server's
  // answer is optimism rather than evidence. Playwright starts the app with
  // `npm run dev` (playwright.config.ts), so NODE_ENV is development and the
  // endpoint reports `configured: true` off the hardcoded "demo123" local-dev
  // fallback even when no password was ever provisioned — and that fallback
  // 401s against the seeded database. Believing it made the skip below
  // unreachable in CI, so the specs failed on a bare URL assertion instead,
  // reporting "expected /recruit, received /login" with no hint of the cause.
  // A developer running locally has a seeded database where demo123 genuinely
  // works, so this narrows to CI only.
  if (process.env.CI && !process.env.SEED_DEMO_PASSWORD && !process.env.PILOT_PASSWORD) {
    return false;
  }
  try {
    const res = await page.request.get("/api/auth/test-login", { timeout: 20_000 });
    // 404 is production, where the endpoint does not exist and never will.
    if (res.status() === 404) return false;
    if (!res.ok()) return true;
    const body = (await res.json().catch(() => null)) as { configured?: boolean } | null;
    if (typeof body?.configured !== "boolean") return true;
    return body.configured;
  } catch {
    return true;
  }
}
