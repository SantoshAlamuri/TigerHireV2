import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/screening/whatsapp-flow", () => ({
  handleScreeningWhatsappReply: vi.fn().mockResolvedValue(true),
}));

describe("POST /api/screening/whatsapp/reply", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("returns 404 outside development (production simulation endpoint closed)", async () => {
    process.env.NODE_ENV = "production";
    const { POST } = await import("@/app/api/screening/whatsapp/reply/route");
    const req = new NextRequest("http://localhost:3000/api/screening/whatsapp/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+15551234567", body: "yes" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not available/i);
  });

  it("accepts POST in development when phone and body are provided", async () => {
    process.env.NODE_ENV = "development";
    const { POST } = await import("@/app/api/screening/whatsapp/reply/route");
    const req = new NextRequest("http://localhost:3000/api/screening/whatsapp/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+15551234567", body: "yes" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.handled).toBe(true);
  });
});
