/**
 * E2E tests: admin configures → interview happens
 * File: e2e/settings-to-interview.spec.ts
 * Run: npx playwright test e2e/settings-to-interview.spec.ts
 *
 * Prerequisites:
 *   - App running on localhost:3000
 *   - Test Supabase project seeded (see e2e/fixtures/seed.ts)
 *   - PLAYWRIGHT_BASE_URL set in .env.test
 */

import { test, expect, type Page } from "@playwright/test";

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@test-acme.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "test-password-123";
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? "recruiter@test-acme.com";
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? "test-password-456";

const MOCK_ZOOM_ACCOUNT_ID = "test_acct_001";
const MOCK_ZOOM_CLIENT_ID = "test_client_id_abc";
const MOCK_ZOOM_CLIENT_SECRET = "test_client_secret_xyz_long_enough";
const MOCK_ZOOM_WEBHOOK_SECRET = "whsec_test_webhook_secret_here";
const MOCK_ASSEMBLYAI_KEY = "assemblyai-e2e-mock-placeholder-not-a-real-api-key";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/dashboard/**");
}

async function logout(page: Page) {
  await page
    .getByRole("button", { name: /account|profile|logout/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /sign out|logout/i }).click();
  await page.waitForURL("/auth/login");
}

// ─── Suite 1: Access control ──────────────────────────────────────────────────

test.describe("Settings access control", () => {
  test("admin can access settings page", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/dashboard/settings/integrations");
    await expect(page.getByText("Integrations")).toBeVisible();
    await expect(page.getByText("Connect your calendar")).toBeVisible();
  });

  test("non-admin recruiter is redirected away from settings", async ({ page }) => {
    await loginAs(page, RECRUITER_EMAIL, RECRUITER_PASSWORD);
    await page.goto("/dashboard/settings/integrations");
    // Should redirect to dashboard or show forbidden
    await expect(page).not.toHaveURL("/dashboard/settings/integrations");
  });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/dashboard/settings/integrations");
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

// ─── Suite 2: Admin configures Zoom ──────────────────────────────────────────

test.describe("Admin configures Zoom integration", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/dashboard/settings/integrations");
  });

  test("Zoom row is visible with correct initial state", async ({ page }) => {
    const zoomRow = page.getByTestId("integration-row-zoom");
    await expect(zoomRow).toBeVisible();
    await expect(zoomRow.getByText("Zoom")).toBeVisible();
  });

  test("admin can expand Zoom configuration", async ({ page }) => {
    await page
      .getByTestId("integration-row-zoom")
      .getByRole("button", { name: /configure|connect/i })
      .click();
    await expect(page.getByLabel("Account ID")).toBeVisible();
    await expect(page.getByLabel("Client ID")).toBeVisible();
    await expect(page.getByLabel("Client Secret")).toBeVisible();
  });

  test("key fields are masked by default", async ({ page }) => {
    await page
      .getByTestId("integration-row-zoom")
      .getByRole("button", { name: /configure|connect/i })
      .click();
    const secretInput = page.getByLabel("Client Secret");
    await expect(secretInput).toHaveAttribute("type", "password");
  });

  test("show/hide toggle reveals and masks key", async ({ page }) => {
    await page
      .getByTestId("integration-row-zoom")
      .getByRole("button", { name: /configure|connect/i })
      .click();
    const showBtn = page.getByTestId("show-toggle-clientSecret");
    await showBtn.click();
    await expect(page.getByLabel("Client Secret")).toHaveAttribute("type", "text");
    await showBtn.click();
    await expect(page.getByLabel("Client Secret")).toHaveAttribute("type", "password");
  });

  test("admin saves Zoom keys successfully", async ({ page }) => {
    // Intercept the API call to avoid real key validation
    await page.route("/api/settings/integrations", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      } else {
        await route.continue();
      }
    });

    await page
      .getByTestId("integration-row-zoom")
      .getByRole("button", { name: /configure|connect/i })
      .click();
    await page.getByLabel("Account ID").fill(MOCK_ZOOM_ACCOUNT_ID);
    await page.getByLabel("Client ID").fill(MOCK_ZOOM_CLIENT_ID);
    await page.getByLabel("Client Secret").fill(MOCK_ZOOM_CLIENT_SECRET);
    await page.getByLabel("Webhook Secret").fill(MOCK_ZOOM_WEBHOOK_SECRET);
    await page.getByRole("button", { name: /save/i }).click();

    await expect(page.getByText("Saved")).toBeVisible();
  });

  test("audit log shows key update after save", async ({ page }) => {
    await page.route("/api/settings/integrations", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      } else {
        await route.continue();
      }
    });

    await page
      .getByTestId("integration-row-zoom")
      .getByRole("button", { name: /configure|connect/i })
      .click();
    await page.getByLabel("Account ID").fill(MOCK_ZOOM_ACCOUNT_ID);
    await page.getByLabel("Client ID").fill(MOCK_ZOOM_CLIENT_ID);
    await page.getByLabel("Client Secret").fill(MOCK_ZOOM_CLIENT_SECRET);
    await page.getByLabel("Webhook Secret").fill(MOCK_ZOOM_WEBHOOK_SECRET);
    await page.getByRole("button", { name: /save/i }).click();
    await page.getByText("Saved").waitFor();

    await page.goto("/dashboard/settings/audit");
    await expect(page.getByText(/integration.*key.*updated|zoom/i).first()).toBeVisible();
  });

  test("raw key is never visible in network response", async ({ page }) => {
    const responses: string[] = [];
    page.on("response", async (res) => {
      if (res.url().includes("/api/settings/integrations")) {
        const text = await res.text().catch(() => "");
        responses.push(text);
      }
    });

    await page.reload();
    await page.waitForLoadState("networkidle");

    responses.forEach((body) => {
      expect(body).not.toContain(MOCK_ZOOM_CLIENT_SECRET);
      expect(body).not.toContain("secret_ref");
    });
  });
});

// ─── Suite 3: Admin configures AssemblyAI ────────────────────────────────────

test.describe("Admin configures AssemblyAI transcription", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/dashboard/settings/integrations");
  });

  test("admin saves AssemblyAI key with feature toggles", async ({ page }) => {
    await page.route("/api/settings/integrations", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      } else {
        await route.continue();
      }
    });

    await page
      .getByTestId("integration-row-assemblyai")
      .getByRole("button", { name: /configure|connect/i })
      .click();
    await page.getByLabel("API Key").fill(MOCK_ASSEMBLYAI_KEY);

    // Feature toggles
    const piiToggle = page.getByLabel("PII redaction");
    await expect(piiToggle).toBeChecked(); // on by default
    const chaptersToggle = page.getByLabel("Auto chapters");
    await expect(chaptersToggle).not.toBeChecked();
    await chaptersToggle.check();

    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText("Saved")).toBeVisible();
  });
});

// ─── Suite 4: Privacy settings ───────────────────────────────────────────────

test.describe("Admin configures privacy & consent", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/dashboard/settings/privacy");
  });

  test("consent message is editable and saves", async ({ page }) => {
    await page.route("/api/settings/privacy", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      } else {
        await route.continue();
      }
    });

    const textarea = page.getByRole("textbox", { name: /consent message/i });
    await textarea.clear();
    await textarea.fill(
      "This interview will be recorded and transcribed by TigerHire. By clicking Continue, you consent.",
    );
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText("Saved")).toBeVisible();
  });

  test("retention period can be changed", async ({ page }) => {
    const select = page.getByRole("combobox", { name: /recording retention/i });
    await select.selectOption("180");
    await expect(select).toHaveValue("180");
  });
});

// ─── Suite 5: Full E2E — admin configures → interview is scheduled ────────────

test.describe("Full flow: admin configures → interview scheduled", () => {
  test("admin sets up integrations, recruiter books interview, candidate joins", async ({
    browser,
  }) => {
    // Step 1: Admin configures integrations
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAs(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
    await adminPage.goto("/dashboard/settings/integrations");

    // Mock all API calls for the admin setup
    await adminPage.route("/api/settings/integrations", (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ success: true }) }),
    );

    // Zoom setup
    await adminPage
      .getByTestId("integration-row-zoom")
      .getByRole("button", { name: /configure|connect/i })
      .click();
    await adminPage.getByLabel("Account ID").fill(MOCK_ZOOM_ACCOUNT_ID);
    await adminPage.getByLabel("Client ID").fill(MOCK_ZOOM_CLIENT_ID);
    await adminPage.getByLabel("Client Secret").fill(MOCK_ZOOM_CLIENT_SECRET);
    await adminPage.getByLabel("Webhook Secret").fill(MOCK_ZOOM_WEBHOOK_SECRET);
    await adminPage.getByRole("button", { name: /save/i }).click();
    await adminPage.getByText("Saved").waitFor();

    // Step 2: Recruiter books an interview
    const recruiterContext = await browser.newContext();
    const recruiterPage = await recruiterContext.newPage();
    await loginAs(recruiterPage, RECRUITER_EMAIL, RECRUITER_PASSWORD);

    await recruiterPage.goto("/dashboard/candidates");
    await recruiterPage.getByTestId("candidate-row").first().click();
    await recruiterPage.getByRole("button", { name: /schedule interview/i }).click();

    // Booking modal
    await expect(recruiterPage.getByRole("dialog")).toBeVisible();
    await recruiterPage.getByLabel(/interview type/i).selectOption("technical");

    // Select an available slot
    const availableSlot = recruiterPage.getByTestId("time-slot").first();
    await availableSlot.click();
    await expect(availableSlot).toHaveClass(/selected/);

    await recruiterPage.route("/api/interviews", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          interviewId: "interview-test-001",
          joinUrl: "https://zoom.us/j/test123",
          candidateLink: "http://localhost:3000/interview/candidate-token-abc",
        }),
      }),
    );

    await recruiterPage.getByRole("button", { name: /confirm booking/i }).click();
    await expect(recruiterPage.getByText(/interview scheduled/i)).toBeVisible();

    // Step 3: Candidate opens their interview link
    const candidatePage = await browser.newPage();
    await candidatePage.goto("http://localhost:3000/interview/candidate-token-abc");

    // Consent gate must appear
    await expect(candidatePage.getByText(/recorded and transcribed/i)).toBeVisible();
    await expect(candidatePage.getByRole("button", { name: /continue/i })).toBeVisible();

    // Video room must NOT be visible before consent
    await expect(candidatePage.getByTestId("video-room")).not.toBeVisible();

    // Accept consent
    await candidatePage.getByRole("button", { name: /continue/i }).click();

    // Video room loads after consent
    await expect(candidatePage.getByTestId("video-room")).toBeVisible();

    // Cleanup
    await adminContext.close();
    await recruiterContext.close();
    await candidatePage.close();
  });
});

// ─── Suite 6: Error states ────────────────────────────────────────────────────

test.describe("Error handling in settings", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test("shows error state when API key is rejected by provider", async ({ page }) => {
    await page.route("/api/settings/integrations", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: false,
          provider: "sendgrid",
          status: "error",
          statusMessage: "API key was rejected by SendGrid.",
        }),
      }),
    );

    await page.goto("/dashboard/settings/integrations");
    await page
      .getByTestId("integration-row-sendgrid")
      .getByRole("button", { name: /fix|configure|connect/i })
      .click();
    await page.getByLabel("API Key").fill("SG.invalid_key_here");
    await page.getByRole("button", { name: /save/i }).click();

    await expect(page.getByText(/rejected by SendGrid/i)).toBeVisible();
    await expect(page.getByTestId("status-pill-sendgrid")).toHaveText("Error");
  });

  test("shows validation error for key that is too short", async ({ page }) => {
    await page.goto("/dashboard/settings/integrations");
    await page
      .getByTestId("integration-row-assemblyai")
      .getByRole("button", { name: /configure|connect/i })
      .click();
    await page.getByLabel("API Key").fill("short");
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText(/too short|at least/i)).toBeVisible();
  });
});
