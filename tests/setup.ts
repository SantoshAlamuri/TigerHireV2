import "@testing-library/jest-dom";
import React from "react";

// Route/unit tests import server modules that declare "server-only".
// In Vitest (non-Next runtime), treat it as a no-op module.
vi.mock("server-only", () => ({}));

// Mock next/link for component tests (avoids router context)
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement("a", { href }, children),
}));

// Mock next/navigation so useRouter, usePathname etc. work in component tests
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
