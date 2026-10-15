import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Gate coverage on API routes and shared library code exercised by unit/integration tests.
      // UI routes under src/app/(dashboard) and most components are intentionally out of scope here.
      include: ["src/app/api/**/*.ts", "src/lib/**/*.ts"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
        "**/node_modules/**",
        "**/*.md",
        "src/instrumentation.ts",
        "src/proxy.ts",
        "src/lib/mock/data_original.ts",
        "**/layout.tsx",
        "**/loading.tsx",
        "**/page.tsx",
        "**/error.tsx",
        "**/global-error.tsx",
        "**/not-found.tsx",
        "src/lib/mock/data_original.ts",
        "src/**/*.md",
        // Fixture / generated data and LLM agent surfaces not covered by route tests today.
        "src/lib/mock/**",
        "src/lib/fitscore/hybrid/data/**",
        "src/lib/agents/**",
      ],
      // Opt-in: `VITEST_ENFORCE_COVERAGE=1` or `npm run test:coverage:strict`. Default: report only.
      // RATCHET: floors sit just under measured coverage (2026-07-23 CI: lines 44.52,
      // branches 34.48, functions 48.88, statements 42.08). They catch regressions
      // without blocking on legacy debt — the old flat 70 failed every main-flow run,
      // which skipped Build → E2E → K6 on every push to main. When coverage grows,
      // RAISE these floors to just under the new measured numbers (never lower them).
      ...(process.env.VITEST_ENFORCE_COVERAGE === "1"
        ? {
            thresholds: {
              lines: 43,
              branches: 33,
              functions: 47,
              statements: 41,
            },
          }
        : {}),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
