import { describe, it, expect, vi } from "vitest";
import {
  generateCorrelationId,
  getCorrelationId,
  runWithCorrelationId,
  CORRELATION_HEADER,
} from "@/lib/observability/correlation";
import { withCorrelation } from "@/lib/observability/with-correlation";
import { NextRequest } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("correlation", () => {
  describe("generateCorrelationId", () => {
    it("returns a valid UUID v4 string", () => {
      const id = generateCorrelationId();
      expect(id).toMatch(UUID_RE);
    });

    it("returns unique values on each call", () => {
      const a = generateCorrelationId();
      const b = generateCorrelationId();
      expect(a).not.toBe(b);
    });
  });

  describe("getCorrelationId", () => {
    it("returns undefined when called outside a correlation context", () => {
      expect(getCorrelationId()).toBeUndefined();
    });
  });

  describe("runWithCorrelationId", () => {
    it("stores and retrieves the correlation ID inside the callback", () => {
      const id = "test-correlation-123";
      runWithCorrelationId(id, () => {
        expect(getCorrelationId()).toBe(id);
      });
    });

    it("returns the callback's return value", () => {
      const result = runWithCorrelationId("id-1", () => 42);
      expect(result).toBe(42);
    });

    it("cleans up context after the callback completes", () => {
      runWithCorrelationId("id-temp", () => {});
      expect(getCorrelationId()).toBeUndefined();
    });

    it("uses the inner ID when contexts are nested", () => {
      runWithCorrelationId("outer", () => {
        expect(getCorrelationId()).toBe("outer");
        runWithCorrelationId("inner", () => {
          expect(getCorrelationId()).toBe("inner");
        });
        expect(getCorrelationId()).toBe("outer");
      });
    });
  });

  describe("CORRELATION_HEADER", () => {
    it("equals x-correlation-id", () => {
      expect(CORRELATION_HEADER).toBe("x-correlation-id");
    });
  });

  describe("withCorrelation", () => {
    it("extracts correlation ID from request header", async () => {
      const expectedId = "from-header-abc";
      let capturedId: string | undefined;

      const handler = vi.fn(async () => {
        capturedId = getCorrelationId();
        return new Response("ok");
      });

      const wrapped = withCorrelation(handler);
      const req = new NextRequest("http://localhost/api/test", {
        headers: { [CORRELATION_HEADER]: expectedId },
      });

      await wrapped(req);

      expect(handler).toHaveBeenCalledOnce();
      expect(capturedId).toBe(expectedId);
    });

    it("generates a new UUID when header is missing", async () => {
      let capturedId: string | undefined;

      const handler = vi.fn(async () => {
        capturedId = getCorrelationId();
        return new Response("ok");
      });

      const wrapped = withCorrelation(handler);
      const req = new NextRequest("http://localhost/api/test");

      await wrapped(req);

      expect(capturedId).toBeDefined();
      expect(capturedId).toMatch(UUID_RE);
    });

    it("passes through additional arguments to the handler", async () => {
      const handler = vi.fn(async (_req: NextRequest, ...args: unknown[]) => {
        return new Response(JSON.stringify(args));
      });

      const wrapped = withCorrelation(handler);
      const req = new NextRequest("http://localhost/api/test");
      const extraArg = { params: { id: "123" } };

      await wrapped(req, extraArg);

      expect(handler).toHaveBeenCalledWith(req, extraArg);
    });

    it("returns the handler's response", async () => {
      const handler = vi.fn(async () => new Response("hello", { status: 201 }));

      const wrapped = withCorrelation(handler);
      const req = new NextRequest("http://localhost/api/test");

      const response = await wrapped(req);

      expect(response.status).toBe(201);
      expect(await response.text()).toBe("hello");
    });
  });
});
