import { vi } from "vitest";
import { createTenantScopedClientMock, mockApiHelperJsonHandlers } from "../helpers";

/** Hoist in route tests: `const { mockGetAuthContext, mockGetTenantScopedClient } = vi.hoisted(() => createApiHelpersMocks());` */
export function createApiHelpersMocks() {
  const mockGetAuthContext = vi.fn();
  const mockGetTenantScopedClient = vi.fn(async () => createTenantScopedClientMock());
  const apiHelpers = {
    getAuthContext: () => mockGetAuthContext(),
    requireAuth: (ctx: unknown) => ctx !== null,
    hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
    getTenantScopedClient: (...args: unknown[]) => mockGetTenantScopedClient(...args),
    ...mockApiHelperJsonHandlers,
    reportError: vi.fn(),
  };
  return { mockGetAuthContext, mockGetTenantScopedClient, apiHelpers };
}
