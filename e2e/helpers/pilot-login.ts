import type { Page } from "@playwright/test";
import { loginWithFallback } from "./login";
import { gotoRoute } from "./navigation";
import { pilotPassword } from "./pilot-env";
import type { PilotAccount, PilotAccountKey } from "./pilot-accounts";
import { PILOT_ACCOUNTS } from "./pilot-accounts";
import { dismissCookieBanner } from "./dismiss-cookie-banner";

/** Click "Setup demo users" on the login page when the dev/preview panel is visible. */
export async function ensureDemoUsersSeeded(page: Page): Promise<void> {
  await gotoRoute(page, "/login");
  const setupBtn = page.getByRole("button", { name: /setup demo users/i }).first();
  if (await setupBtn.isVisible().catch(() => false)) {
    await setupBtn.click();
    await page.waitForTimeout(1500);
  }
}

/**
 * Sign in via one-click test account button (falls back to email/password in loginWithFallback).
 */
export async function pilotLogin(page: Page, key: PilotAccountKey): Promise<PilotAccount> {
  const account = PILOT_ACCOUNTS[key];
  await ensureDemoUsersSeeded(page);
  await loginWithFallback(page, {
    email: account.email,
    buttonName: account.buttonLabel,
    expectedPath: account.expectedLanding,
    password: pilotPassword(),
  });
  await dismissCookieBanner(page);
  return account;
}

export async function pilotLoginFresh(page: Page, key: PilotAccountKey): Promise<PilotAccount> {
  await page.context().clearCookies();
  return pilotLogin(page, key);
}
