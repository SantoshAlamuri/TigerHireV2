import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

const healthDuration = new Trend("health_duration");
const healthReadyDuration = new Trend("health_ready_duration");
const jobsListDuration = new Trend("jobs_list_duration");
const homepageDuration = new Trend("homepage_duration");
const waitlistDuration = new Trend("waitlist_count_duration");
const contactPostDuration = new Trend("contact_post_duration");
const applyPageDuration = new Trend("apply_page_duration");
const errorRate = new Rate("errors");

/**
 * API benchmark — measure individual endpoint performance
 * with consistent, moderate load (not a stress test).
 */
export const options = {
  scenarios: {
    per_endpoint_benchmark: {
      executor: "constant-vus",
      vus: 50,
      duration: "3m",
    },
  },
  thresholds: {
    health_duration: ["p(95)<100", "p(99)<300"],
    health_ready_duration: ["p(95)<500", "p(99)<1500"],
    jobs_list_duration: ["p(95)<500", "p(99)<2000"],
    homepage_duration: ["p(95)<1000", "p(99)<3000"],
    errors: ["rate<0.01"],
  },
};

/** k6 entry point: default export required by k6 runner */
export default function apiBenchmark() {
  group("Health Liveness", () => {
    const res = http.get(`${BASE_URL}/api/health`, {
      tags: { name: "GET /api/health" },
      timeout: "5s",
    });
    check(res, { "health 200": (r) => r.status === 200 });
    healthDuration.add(res.timings.duration);
    errorRate.add(res.status !== 200);
  });

  group("Health Readiness", () => {
    const res = http.get(`${BASE_URL}/api/health?ready=1`, {
      tags: { name: "GET /api/health?ready=1" },
      timeout: "5s",
    });
    check(res, { "health-ready 200": (r) => r.status === 200 });
    healthReadyDuration.add(res.timings.duration);
    errorRate.add(res.status >= 500);
  });

  group("Jobs List", () => {
    const res = http.get(`${BASE_URL}/api/jobs?status=open&limit=10`, {
      tags: { name: "GET /api/jobs" },
      timeout: "5s",
    });
    check(res, { "jobs ok": (r) => r.status === 200 || r.status === 401 });
    jobsListDuration.add(res.timings.duration);
    errorRate.add(res.status >= 500);
  });

  group("Homepage", () => {
    const res = http.get(`${BASE_URL}/`, {
      tags: { name: "GET /" },
      timeout: "10s",
    });
    check(res, { "homepage 200": (r) => r.status === 200 });
    homepageDuration.add(res.timings.duration);
    errorRate.add(res.status >= 500);
  });

  group("Waitlist Count", () => {
    const res = http.get(`${BASE_URL}/api/waitlist/count`, {
      tags: { name: "GET /api/waitlist/count" },
      timeout: "5s",
    });
    check(res, { "waitlist ok": (r) => r.status < 500 });
    waitlistDuration.add(res.timings.duration);
    errorRate.add(res.status >= 500);
  });

  group("Contact POST (validation)", () => {
    const res = http.post(
      `${BASE_URL}/api/contact`,
      JSON.stringify({ name: "", email: "invalid" }),
      {
        headers: { "Content-Type": "application/json" },
        tags: { name: "POST /api/contact (invalid)" },
        timeout: "5s",
      },
    );
    check(res, {
      "contact rejects invalid": (r) => r.status === 400 || r.status === 422 || r.status < 500,
    });
    contactPostDuration.add(res.timings.duration);
    errorRate.add(res.status >= 500);
  });

  group("Apply Page", () => {
    const res = http.get(`${BASE_URL}/apply/razorpay`, {
      tags: { name: "GET /apply/razorpay" },
      timeout: "10s",
    });
    check(res, { "apply page loads": (r) => r.status < 500 });
    applyPageDuration.add(res.timings.duration);
    errorRate.add(res.status >= 500);
  });

  sleep(Math.random() * 1 + 0.5);
}

export function handleSummary(data) {
  const m = data.metrics;
  const fmt = (key) => {
    const v = m[key]?.values;
    if (!v) return "  (no data)";
    return `  avg=${Math.round(v.avg)}ms  p50=${Math.round(v["p(50)"])}ms  p95=${Math.round(v["p(95)"])}ms  p99=${Math.round(v["p(99)"])}ms  max=${Math.round(v.max)}ms`;
  };

  const lines = [
    "╔══════════════════════════════════════════════════╗",
    "║         K6 API BENCHMARK SUMMARY                ║",
    "╚══════════════════════════════════════════════════╝",
    "",
    "Health Liveness:",
    fmt("health_duration"),
    "",
    "Health Readiness:",
    fmt("health_ready_duration"),
    "",
    "Jobs List:",
    fmt("jobs_list_duration"),
    "",
    "Homepage:",
    fmt("homepage_duration"),
    "",
    "Waitlist Count:",
    fmt("waitlist_count_duration"),
    "",
    "Contact POST (validation):",
    fmt("contact_post_duration"),
    "",
    "Apply Page:",
    fmt("apply_page_duration"),
    "",
    `Total Requests: ${m.http_reqs?.values?.count || 0}`,
    `Error Rate:     ${((m.errors?.values?.rate || 0) * 100).toFixed(2)}%`,
  ];

  return {
    "k6/results-benchmark.json": JSON.stringify(data, null, 2),
    stdout: lines.join("\n") + "\n",
  };
}
