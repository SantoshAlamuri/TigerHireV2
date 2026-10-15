import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/sw.js",
    "public/workbox-*.js",
    "public/swe-worker-*.js",
    "public/fallback-*.js",
    "src/lib/mock/data_original.ts",
    // Playwright / load tests / stray imports — not part of app lint budget for CI.
    "e2e/**",
    "imported-from-zip/**",
    "k6/**",
    "load/**",
  ]),
  {
    files: ["k6/**/*.js"],
    languageOptions: {
      globals: { __ENV: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off",
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off",
      "prefer-const": "off",
      complexity: "off",
      "max-depth": "off",
      "max-lines": "off",
      "max-lines-per-function": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
    },
  },
  {
    // An empty .catch() reads as "handled" while doing nothing at all.
    //
    // Every such site audited on 2026-08-05 sat on a helper that already caught
    // and logged its own failures (enqueue, cacheDel), so the catch was dead
    // code that made the call look defended. The one real bug it disguised was
    // an unawaited enqueue on a serverless handler: the response returned, the
    // instance froze, and the job vanished with no error and no retry — a role
    // never distributed, a closed role never taken down. See
    // src/lib/jobs/enqueue-after-response.ts.
    //
    // Catch with a body — log it, degrade deliberately, or return a fallback
    // value. `.catch(() => null)` stays allowed: it states a fallback rather
    // than pretending to handle (request.json().catch(() => null) is the
    // canonical use).
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression[body.type='BlockStatement'][body.body.length=0]",
          message:
            "Empty .catch() swallows the failure. Log it (logger.warn/error with a distinct event name), or use .catch(() => null) if a fallback value is genuinely what you want.",
        },
      ],
    },
  },
  {
    // Scoring-critical UI: stale hook closures here silently corrupt scoring
    // inputs or hide flags (see the 2026-07-06 need-to-haves data-loss bug).
    // These paths are clean — keep the rule at "error" and extend the list as
    // other directories are cleaned up rather than weakening it.
    files: [
      "src/components/fitscore/**/*.ts",
      "src/components/fitscore/**/*.tsx",
      "src/components/dashboard/FitScore*.tsx",
    ],
    rules: {
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      complexity: "off",
      "max-lines": "off",
      "max-lines-per-function": "off",
      "@next/next/no-assign-module-variable": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
    },
  },
  {
    files: ["src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/**"],
              message:
                "Keep src/lib framework-agnostic. Move app-specific orchestration to src/app or shared logic into src/lib.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/api/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/components/**"],
              message: "API routes must not depend on UI components.",
            },
          ],
        },
      ],
      "max-lines": "off",
      "max-lines-per-function": "off",
    },
  },
  {
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    rules: {
      "@next/next/no-assign-module-variable": "off",
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/admin",
              message:
                "UI must not import admin database clients. Go through API routes or server actions.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/(public)/**/*.tsx"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);

export default eslintConfig;
