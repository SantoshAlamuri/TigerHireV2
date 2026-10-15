import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const CRON_SECRET = "test-cron-secret";

const mockFrom = vi.fn();
const mockAdminGetUserById = vi.fn();
const mockRpc = vi.fn().mockResolvedValue({ data: 1, error: null });
const mockSupabaseAdmin = {
  from: (...args: unknown[]) => mockFrom(...args),
  rpc: (...args: unknown[]) => mockRpc(...args),
  auth: {
    admin: {
      getUserById: (...args: unknown[]) => mockAdminGetUserById(...args),
    },
  },
};

function createBuilderWithNot(overrides: { data?: unknown; error?: unknown; count?: number } = {}) {
  const builder = createMockQueryBuilder(overrides);
  (builder as any).not = vi.fn().mockReturnValue(builder);
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockSupabaseAdmin,
}));

const mockSendWhatsApp = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/services/whatsapp", () => ({
  sendWhatsAppMessage: (...args: unknown[]) => mockSendWhatsApp(...args),
  sendInterviewReminderTemplate: vi.fn().mockResolvedValue(undefined),
}));

const mockSendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/services/resend", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/lib/config/env", () => ({
  env: {
    baseUrl: "http://localhost:3000",
    cronSecret: "test-cron-secret",
  },
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: vi.fn(),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/security/cron-auth", () => ({
  validateCronSecret: vi.fn(async (request: Request) => {
    const auth = request.headers.get("authorization");
    const expected = process.env.CRON_SECRET;
    return Boolean(expected && auth === `Bearer ${expected}`);
  }),
}));

function cronRequest(url: string, secret?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) headers["authorization"] = `Bearer ${secret}`;
  return new Request(url, { method: "POST", headers });
}

// ---------------------------------------------------------------------------
// POST /api/cron/cleanup
// ---------------------------------------------------------------------------
describe("POST /api/cron/cleanup", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    mockFrom.mockReset();
  });

  it("returns 401 without valid CRON_SECRET", async () => {
    const { POST } = await import("@/app/api/cron/cleanup/route");
    const res = await POST(cronRequest("http://localhost:3000/api/cron/cleanup", "wrong") as any);
    expect(res.status).toBe(401);
  }, 15000);

  it("returns 401 when no authorization header", async () => {
    const { POST } = await import("@/app/api/cron/cleanup/route");
    const res = await POST(cronRequest("http://localhost:3000/api/cron/cleanup") as any);
    expect(res.status).toBe(401);
  });

  it("returns { closed: 0 } when no stale jobs found", async () => {
    const builder = createMockQueryBuilder({ data: [] });
    mockFrom.mockReturnValue(builder);
    const { POST } = await import("@/app/api/cron/cleanup/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/cleanup", CRON_SECRET) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.closed).toBe(0);
  });

  it("closes stale jobs and returns count", async () => {
    const selectBuilder = createMockQueryBuilder({
      data: [{ id: "j1" }, { id: "j2" }],
    });
    const updateBuilder = createMockQueryBuilder();
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? selectBuilder : updateBuilder;
    });

    const { POST } = await import("@/app/api/cron/cleanup/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/cleanup", CRON_SECRET) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.closed).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// POST /api/cron/reminders
// ---------------------------------------------------------------------------
describe("POST /api/cron/reminders", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    mockFrom.mockReset();
    mockSendWhatsApp.mockClear();
  });

  it("returns 401 without valid CRON_SECRET", async () => {
    const { POST } = await import("@/app/api/cron/reminders/route");
    const res = await POST(cronRequest("http://localhost:3000/api/cron/reminders", "bad") as any);
    expect(res.status).toBe(401);
  });

  it("returns { sent: 0 } when no upcoming interviews", async () => {
    const builder = createBuilderWithNot({ data: [] });
    mockFrom.mockReturnValue(builder);
    const { POST } = await import("@/app/api/cron/reminders/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/reminders", CRON_SECRET) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.total).toBe(0);
  });

  it("sends WhatsApp reminders for upcoming interviews", async () => {
    const rows = [
      {
        id: "pc-1",
        candidate_id: "c-1",
        job_id: "j-1",
        interview_scheduled_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        reminder_sent_at: null,
        candidates: {
          phone: "+919876543210",
          full_name: "Jane Doe",
          name: "Jane",
        },
      },
      {
        id: "pc-2",
        candidate_id: "c-2",
        job_id: "j-1",
        interview_scheduled_at: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
        reminder_sent_at: null,
        candidates: { phone: null, full_name: "No Phone", name: "NP" },
      },
    ];

    const selectBuilder = createBuilderWithNot({ data: rows });
    const updateBuilder = createMockQueryBuilder();
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? selectBuilder : updateBuilder;
    });

    const { POST } = await import("@/app/api/cron/reminders/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/reminders", CRON_SECRET) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(1);
    expect(body.total).toBe(2);
    // sendInterviewReminderTemplate is tried first; sendWhatsAppMessage is fallback
  });
});

// ---------------------------------------------------------------------------
// POST /api/cron/job-alerts
// ---------------------------------------------------------------------------
describe("POST /api/cron/job-alerts", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    mockFrom.mockReset();
    mockSendEmail.mockClear();
    mockAdminGetUserById.mockReset();
  });

  it("returns 401 without valid CRON_SECRET", async () => {
    const { POST } = await import("@/app/api/cron/job-alerts/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/job-alerts", "wrong") as any,
    );
    expect(res.status).toBe(401);
  }, 15000);

  it("returns 500 when saved_searches query fails", async () => {
    const builder = createMockQueryBuilder({
      data: null,
      error: { message: "db error" },
    });
    mockFrom.mockReturnValue(builder);
    const { POST } = await import("@/app/api/cron/job-alerts/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/job-alerts", CRON_SECRET) as any,
    );
    expect(res.status).toBe(500);
  });

  it("returns { sent: 0, skipped: 0 } when no saved searches", async () => {
    const builder = createMockQueryBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    const { POST } = await import("@/app/api/cron/job-alerts/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/job-alerts", CRON_SECRET) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(0);
    expect(body.total).toBe(0);
  });

  it("sends email alerts and updates last_alerted_at", async () => {
    const searches = [
      {
        id: "s-1",
        user_id: "u-1",
        name: "Frontend Jobs",
        alert_enabled: true,
        alert_frequency: "daily",
        last_alerted_at: null,
        filters: { role_function: "frontend" },
        profiles: { full_name: "Alice" },
      },
    ];

    const savedSearchBuilder = createMockQueryBuilder({
      data: searches,
      error: null,
    });
    const jobBuilder = createMockQueryBuilder({
      data: [
        {
          id: "j-1",
          title: "React Dev",
          organisation_id: "org-1",
          organisations: { name: "Acme" },
          location: "Remote",
          remote_allowed: true,
          created_at: new Date().toISOString(),
        },
      ],
    });
    const updateBuilder = createMockQueryBuilder();

    let fromCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      fromCallCount++;
      if (table === "saved_searches" && fromCallCount <= 1) return savedSearchBuilder;
      if (table === "jobs") return jobBuilder;
      return updateBuilder;
    });

    mockAdminGetUserById.mockResolvedValue({
      data: { user: { email: "alice@test.com" } },
    });

    const { POST } = await import("@/app/api/cron/job-alerts/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/job-alerts", CRON_SECRET) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledOnce();
  });

  it("skips weekly alerts alerted less than 6.5 days ago", async () => {
    const recentDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const searches = [
      {
        id: "s-1",
        user_id: "u-1",
        name: "Weekly Search",
        alert_enabled: true,
        alert_frequency: "weekly",
        last_alerted_at: recentDate,
        filters: {},
        profiles: { full_name: "Bob" },
      },
    ];
    const savedSearchBuilder = createMockQueryBuilder({
      data: searches,
      error: null,
    });
    mockFrom.mockReturnValue(savedSearchBuilder);

    const { POST } = await import("@/app/api/cron/job-alerts/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/job-alerts", CRON_SECRET) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(1);
    expect(body.sent).toBe(0);
  });

  it("skips daily alerts alerted less than 20 hours ago", async () => {
    const recentDate = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    const searches = [
      {
        id: "s-2",
        user_id: "u-2",
        name: "Daily Search",
        alert_enabled: true,
        alert_frequency: "daily",
        last_alerted_at: recentDate,
        filters: {},
        profiles: { full_name: "Carol" },
      },
    ];
    const savedSearchBuilder = createMockQueryBuilder({
      data: searches,
      error: null,
    });
    mockFrom.mockReturnValue(savedSearchBuilder);

    const { POST } = await import("@/app/api/cron/job-alerts/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/job-alerts", CRON_SECRET) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(1);
    expect(body.sent).toBe(0);
  });

  it("skips when no user email found", async () => {
    const searches = [
      {
        id: "s-3",
        user_id: "u-3",
        name: "No Email Search",
        alert_enabled: true,
        alert_frequency: "daily",
        last_alerted_at: null,
        filters: {},
        profiles: { full_name: "Dave" },
      },
    ];

    const savedSearchBuilder = createMockQueryBuilder({
      data: searches,
      error: null,
    });
    const jobBuilder = createMockQueryBuilder({
      data: [
        {
          id: "j-1",
          title: "Job",
          organisation_id: "o",
          organisations: null,
          location: null,
          remote_allowed: false,
          created_at: new Date().toISOString(),
        },
      ],
    });

    let fromCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      fromCallCount++;
      if (table === "saved_searches") return savedSearchBuilder;
      if (table === "jobs") return jobBuilder;
      return createMockQueryBuilder();
    });

    mockAdminGetUserById.mockResolvedValue({ data: { user: null } });

    const { POST } = await import("@/app/api/cron/job-alerts/route");
    const res = await POST(
      cronRequest("http://localhost:3000/api/cron/job-alerts", CRON_SECRET) as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(1);
    expect(body.sent).toBe(0);
  });
});
