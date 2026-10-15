import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import bundleAnalyzer from "@next/bundle-analyzer";
import withPWAInit from "@ducanh2912/next-pwa";
import { AGENCY_UPLOAD_CLIENT_BATCH_SIZE } from "./src/lib/constants/agency-bulk-upload";
import { MAX_STANDARD_UPLOAD_BYTES } from "./src/lib/constants/upload-limits";

/** Proxy buffers the full request body for `/api/*`; default 10MB truncates large multipart uploads. */
const AGENCY_BULK_PROXY_BODY_BYTES = Math.ceil(
  AGENCY_UPLOAD_CLIENT_BATCH_SIZE * MAX_STANDARD_UPLOAD_BYTES * 1.08,
);

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  reloadOnOnline: true,
  cacheOnFrontEndNav: true,
  fallbacks: { document: "/offline.html" },
  workboxOptions: { skipWaiting: true },
});

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const isDevelopment = process.env.NODE_ENV === "development";

/** When set, Supabase API (auth, rest, etc.) is proxied through the app origin so the browser only sees your domain. */
const supabaseInternalUrl = process.env.SUPABASE_INTERNAL_URL;

const nextConfig: NextConfig = {
  turbopack: {},
  serverExternalPackages: [
    "pdf-parse",
    "pdfjs-dist",
    "mammoth",
    "@opentelemetry/api",
    "@opentelemetry/core",
    "@opentelemetry/instrumentation",
  ],
  experimental: {
    // Next.js 16+: required for large POST bodies when `src/proxy.ts` runs on `/api/*`.
    proxyClientMaxBodySize: AGENCY_BULK_PROXY_BODY_BYTES,
    serverActions: {
      bodySizeLimit: AGENCY_BULK_PROXY_BODY_BYTES,
    },
    optimizePackageImports: ["lucide-react", "recharts", "@sentry/nextjs", "zod", "posthog-js"],
  },
  async redirects() {
    return [
      { source: "/auth/login", destination: "/login", permanent: false },
      { source: "/auth/register", destination: "/register", permanent: false },
      { source: "/auth/forgot-password", destination: "/forgot-password", permanent: false },
      { source: "/auth/reset-password", destination: "/reset-password", permanent: false },
      { source: "/referrer", destination: "/refer/dashboard", permanent: true },
      { source: "/referrer/join", destination: "/refer/join", permanent: true },
      { source: "/refer/login", destination: "/register", permanent: false },
      { source: "/refer/auth", destination: "/login", permanent: true },
      { source: "/refer/dashboard", destination: "/dashboard/referrer", permanent: true },
      { source: "/dashboard/referrer/join", destination: "/refer/join", permanent: true },
      { source: "/api/refer/open-jobs", destination: "/api/refer/jobs/open", permanent: false },
      { source: "/api/refer/links", destination: "/api/refer/links/generate", permanent: false },
      {
        source: "/api/referrer/profile",
        destination: "/api/refer/dashboard/profile",
        permanent: false,
      },
      { source: "/recruit/offers", destination: "/company/offers", permanent: false },
      { source: "/recruit/offers/draft", destination: "/company/offers/draft", permanent: false },
      { source: "/recruit/assessments", destination: "/company/assessments", permanent: false },
      {
        source: "/recruit/hiring-requests",
        destination: "/company/hiring-requests",
        permanent: false,
      },
      {
        source: "/recruit/settings/pipeline",
        destination: "/company/settings/pipeline",
        permanent: false,
      },
      {
        source: "/recruit/settings/screening",
        destination: "/company/settings/screening",
        permanent: false,
      },
      {
        source: "/recruit/settings/offer-letter-templates",
        destination: "/company/settings/offer-letter-templates",
        permanent: false,
      },
      {
        source: "/recruit/settings/compensation-bands",
        destination: "/company/settings/compensation-bands",
        permanent: false,
      },
      {
        source: "/recruit/settings/offer-approval-workflow",
        destination: "/company/settings/offer-approval-workflow",
        permanent: false,
      },
      {
        source: "/recruit/settings/requisition-approval-workflow",
        destination: "/company/settings/requisition-approval-workflow",
        permanent: false,
      },
      {
        source: "/recruit/settings/requisition-templates",
        destination: "/company/settings/requisition-templates",
        permanent: false,
      },
      {
        source: "/recruit/settings/requisition-delegations",
        destination: "/company/settings/requisition-delegations",
        permanent: false,
      },
      {
        source: "/employee/open-roles",
        destination: "/employee",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    const base =
      typeof supabaseInternalUrl === "string" && supabaseInternalUrl.length > 0
        ? supabaseInternalUrl.replace(/\/$/, "")
        : null;
    const rewrites: { source: string; destination: string }[] = [
      { source: "/favicon.ico", destination: "/favicon.svg" },
    ];
    if (!base) return rewrites;
    return [
      ...rewrites,
      { source: "/auth/:path*", destination: `${base}/auth/:path*` },
      { source: "/rest/:path*", destination: `${base}/rest/:path*` },
      { source: "/realtime", destination: `${base}/realtime` },
      { source: "/storage/:path*", destination: `${base}/storage/:path*` },
      {
        source: "/functions/v1/:path*",
        destination: `${base}/functions/v1/:path*`,
      },
    ];
  },
  async headers() {
    const headers = [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // CSP (with nonce for script-src) is set in src/proxy.ts so inline scripts can use nonce.
          // Do not set CSP here to avoid duplicate headers; proxy sets the full policy.
        ],
      },
    ];

    if (!isDevelopment) {
      headers.unshift({
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      });
    }

    return headers;
  },
};

const sentryConfig = {
  org: "tigerhire",
  project: "tigerhire-web",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  tunnelRoute: "/monitoring",
  hideSourceMaps: true,
};

let config: NextConfig = withPWA(nextConfig);
if (process.env.SENTRY_DSN) config = withSentryConfig(config, sentryConfig);
if (process.env.ANALYZE === "true") config = withBundleAnalyzer(config);
export default config;
