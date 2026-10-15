import { describe, it, expect } from "vitest";
import { getRequestClientIp } from "@/lib/audit/client-ip";

describe("getRequestClientIp", () => {
  it("uses first x-forwarded-for hop", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" },
    });
    expect(getRequestClientIp(req)).toBe("203.0.113.1");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-real-ip": "198.51.100.2" },
    });
    expect(getRequestClientIp(req)).toBe("198.51.100.2");
  });

  it("returns null when absent", () => {
    expect(getRequestClientIp(new Request("http://localhost/"))).toBeNull();
  });
});
