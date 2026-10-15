import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const errorRate = new Rate("errors");
const apiDuration = new Trend("api_duration");
const degradationCounter = new Counter("degraded_responses");

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SOAK_DURATION = __ENV.SOAK_DURATION || "10m";
const SOAK_VUS = parseInt(__ENV.SOAK_VUS || "200", 10);

/**
 * Soak / endurance test — sustained moderate load over a long period.
 * Detects memory leaks, connection pool exhaustion, and gradual degradation.
 *
 * Usage:
 *   k6 run k6/soak-test.js                                 # 10m, 200 VUs
 *   k6 run -e SOAK_DURATION=30m -e SOAK_VUS=300 k6/soak-test.js  # custom
 */
export const options = {
  stages: [
    { duration: "2m", target: SOAK_VUS },
    { duration: SOAK_DURATION, target: SOAK_VUS },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<800", "p(99)<2000"],
    errors: ["rate<0.02"],
    http_req_failed: ["rate<0.02"],
  },
};

const DEGRADATION_THRESHOLD_MS = 2000;

export default function () {
  const healthRes = http.get(`${BASE_URL}/api/health?ready=1`, {
    tags: { name: "health_ready" },
    timeout: "10s",
  });

  check(healthRes, {
    "health is 200": (r) => r.status === 200,
    "health under 1s": (r) => r.timings.duration < 1000,
  });

  const jobsRes = http.get(`${BASE_URL}/api/jobs?status=open&limit=20`, {
    tags: { name: "jobs_list" },
    timeout: "10s",
  });

  const success = check(jobsRes, {
    "jobs status ok": (r) => r.status === 200 || r.status === 401,
    "jobs under 2s": (r) => r.timings.duration < 2000,
  });

  errorRate.add(!success);
  apiDuration.add(jobsRes.timings.duration);

  if (jobsRes.timings.duration > DEGRADATION_THRESHOLD_MS) {
    degradationCounter.add(1);
  }

  const homeRes = http.get(`${BASE_URL}/`, {
    tags: { name: "homepage" },
    timeout: "10s",
  });

  check(homeRes, {
    "homepage loads": (r) => r.status === 200,
  });

  sleep(Math.random() * 3 + 1);
}

export function handleSummary(data) {
  const m = data.metrics;
  const degraded = m.degraded_responses?.values?.count || 0;
  const total = m.http_reqs?.values?.count || 0;
  const degradedPct = total > 0 ? ((degraded / total) * 100).toFixed(2) : "0.00";

  const lines = [
    "╔══════════════════════════════════════════════════╗",
    "║           K6 SOAK TEST SUMMARY                  ║",
    "╚══════════════════════════════════════════════════╝",
    "",
    `Duration:         ${SOAK_DURATION} + ramp phases`,
    `Peak VUs:         ${SOAK_VUS}`,
    `Total Requests:   ${total}`,
    `Avg Duration:     ${Math.round(m.http_req_duration?.values?.avg || 0)}ms`,
    `p50 Duration:     ${Math.round(m.http_req_duration?.values?.["p(50)"] || 0)}ms`,
    `p95 Duration:     ${Math.round(m.http_req_duration?.values?.["p(95)"] || 0)}ms`,
    `p99 Duration:     ${Math.round(m.http_req_duration?.values?.["p(99)"] || 0)}ms`,
    `Error Rate:       ${((m.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`,
    `Degraded (>2s):   ${degraded} (${degradedPct}%)`,
    "",
    "Endurance Verdict:",
    `  Errors < 2%:    ${(m.http_req_failed?.values?.rate || 0) < 0.02 ? "PASS ✓" : "FAIL ✗"}`,
    `  p95 < 800ms:    ${(m.http_req_duration?.values?.["p(95)"] || 0) < 800 ? "PASS ✓" : "FAIL ✗"}`,
    `  Degraded < 5%:  ${parseFloat(degradedPct) < 5 ? "PASS ✓" : "FAIL ✗"}`,
  ];

  return {
    "k6/results-soak.json": JSON.stringify(data, null, 2),
    stdout: lines.join("\n") + "\n",
  };
}
