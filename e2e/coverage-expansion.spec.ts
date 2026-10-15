import { expect, test } from "@playwright/test";

const ACCESS_GATE_PATH = /\/login|\/auth\/no-access|\/awaiting-approval/;

const publicSmokeRoutes = [
  "/",
  "/about",
  "/agencies",
  "/blog",
  "/candidate/login",
  "/candidates",
  "/companies",
  "/contact",
  "/dpa",
  "/forgot-password",
  "/jobs",
  "/marketing",
  "/marketing/about",
  "/marketing/product",
  "/pricing",
  "/privacy",
  "/product",
  "/refer",
  "/refer/auth",
  "/refer/dashboard",
  "/refer/join",
  "/refer/login",
  "/reset-password",
  "/status",
  "/terms",
  "/waitlist",
];

const protectedSmokeRoutes = [
  "/admin",
  "/admin/agents",
  "/admin/audit-log",
  "/admin/billing",
  "/admin/companies",
  "/admin/costs",
  "/admin/feature-flags",
  "/admin/fitscore-observability",
  "/admin/onboard-company",
  "/admin/onboarding-requests",
  "/admin/organisations",
  "/admin/plan-limits",
  "/admin/referrals",
  "/admin/scrape",
  "/admin/settings",
  "/admin/settings/integrations",
  "/admin/settings/scim",
  "/admin/support-requests",
  "/admin/users",
  "/admin/whatsapp-sessions",
  "/agency",
  "/agency/clients",
  "/agency/jobs",
  "/agency/pipeline",
  "/agency/team",
  "/auth/no-access",
  "/auth/request-onboarding",
  "/awaiting-approval",
  "/candidate",
  "/candidate/applications",
  "/candidate/assessments",
  "/candidate/dashboard",
  "/candidate/jobs",
  "/candidate/preferences",
  "/candidate/profile",
  "/candidate/scores",
  "/company",
  "/company/approvals",
  "/company/assessments",
  "/company/billing",
  "/company/finance",
  "/company/hiring-requests",
  "/company/hiring-requests/new",
  "/company/interviews",
  "/company/jobs",
  "/company/my-pipeline",
  "/company/my-settings",
  "/company/my-settings/integrations",
  "/company/offers/draft",
  "/company/pending-resignations",
  "/company/referrals",
  "/company/referrals/campaigns",
  "/company/settings",
  "/company/settings/audit",
  "/company/settings/compensation-bands",
  "/company/settings/job-boards",
  "/company/settings/offer-approval-workflow",
  "/company/settings/offer-letter-templates",
  "/company/settings/outbound-webhooks",
  "/company/settings/permissions",
  "/company/settings/pipeline",
  "/company/settings/privacy",
  "/company/settings/requisition-approval-workflow",
  "/company/settings/requisition-delegations",
  "/company/settings/requisition-templates",
  "/company/team",
  "/dashboard/referrer",
  "/dashboard/referrer/join",
  "/employee",
  "/employee/my-referrals",
  "/employee/refer",
  "/employee/resign",
  "/messages",
  "/notifications",
  "/profile",
  "/recruit",
  "/recruit/analytics",
  "/recruit/applications",
  "/recruit/assessments",
  "/recruit/candidates",
  "/recruit/hiring-requests",
  "/recruit/interview-prep",
  "/recruit/jobs",
  "/recruit/offers",
  "/recruit/offers/draft",
  "/recruit/pipeline",
  "/recruit/saved-searches",
  "/recruit/settings",
  "/recruit/settings/compensation-bands",
  "/recruit/settings/integrations",
  "/recruit/settings/offer-approval-workflow",
  "/recruit/settings/offer-letter-templates",
  "/recruit/settings/pipeline",
  "/recruit/settings/requisition-approval-workflow",
  "/recruit/settings/requisition-delegations",
  "/recruit/settings/requisition-templates",
  "/recruit/settings/screening",
  "/recruit/verify",
  "/support-requests",
];

async function smokeRoute(
  page: import("@playwright/test").Page,
  route: string,
  allowAccessGateRedirect: boolean,
) {
  let response: import("@playwright/test").Response | null = null;
  try {
    response = await page.goto(route, { waitUntil: "commit" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("net::ERR_ABORTED")) {
      throw error;
    }
  }

  if (response) {
    expect(response.status(), `${route} responded with 5xx`).toBeLessThan(500);
  }
  await page.waitForLoadState("domcontentloaded").catch(() => null);
  await expect(page.locator("body")).toBeVisible();

  const pathname = new URL(page.url()).pathname;
  const redirectedToGate = ACCESS_GATE_PATH.test(pathname);

  if (!allowAccessGateRedirect) {
    expect(redirectedToGate, `${route} unexpectedly redirected to auth gate`).toBeFalsy();
  }
}

test.describe("Coverage expansion route smoke checks", () => {
  test.describe.configure({ timeout: 180_000 });

  test("public pages resolve without server errors", async ({ page }) => {
    for (const route of publicSmokeRoutes) {
      await smokeRoute(page, route, true);
    }
  });

  test("protected pages resolve or redirect to access gates", async ({ page }) => {
    for (const route of protectedSmokeRoutes) {
      await smokeRoute(page, route, true);
    }
  });
});
