import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReadFile = vi.fn();
const mockReportError = vi.fn();

vi.mock("fs/promises", () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  default: {
    readFile: (...args: unknown[]) => mockReadFile(...args),
  },
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

describe("GET /api/openapi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns OpenAPI YAML with expected headers", async () => {
    const yaml = "openapi: 3.0.0\ninfo:\n  title: TigerHire API\n";
    mockReadFile.mockResolvedValue(yaml);

    const { GET } = await import("@/app/api/openapi/route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/x-yaml");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    await expect(response.text()).resolves.toBe(yaml);
  });

  it("returns 404 and reports error when YAML file is missing", async () => {
    const error = new Error("ENOENT");
    mockReadFile.mockRejectedValue(error);

    const { GET } = await import("@/app/api/openapi/route");
    const response = await GET();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "OpenAPI spec not found" });
    expect(mockReportError).toHaveBeenCalledWith(error, { route: "GET /api/openapi" });
  });
});
