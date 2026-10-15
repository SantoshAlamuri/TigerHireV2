import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("errors");
const apiDuration = new Trend("api_duration");

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

/**
 * Spike test — simulate sudden traffic surges.
 * Tests how the system handles abrupt load increases and recovers.
 */
export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "10s", target: 800 },
    { duration: "1m", target: 800 },
    { duration: "10s", target: 10 },
    { duration: "1m", target: 10 },
    { duration: "10s", target: 1200 },
    { duration: "1m", target: 1200 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<3000"],
    http_req_failed: ["rate<0.15"],
  },
};

export default function () {
  const responses = http.batch([
    ["GET", `${BASE_URL}/api/health`, null, { tags: { name: "health" }, timeout: "15s" }],
    [
      "GET",
      `${BASE_URL}/api/jobs?status=open&limit=5`,
      null,
      { tags: { name: "jobs_list" }, timeout: "15s" },
    ],
  ]);

  for (const res of responses) {
    const success = check(res, {
      "status is not 5xx": (r) => r.status < 500,
      "response time < 5s": (r) => r.timings.duration < 5000,
    });
    errorRate.add(!success);
    apiDuration.add(res.timings.duration);
  }

  sleep(Math.random() * 0.3);
}

export function handleSummary(data) {
  const m = data.metrics;
  const lines = [
    "╔══════════════════════════════════════════════════╗",
    "║           K6 SPIKE TEST SUMMARY                 ║",
    "╚══════════════════════════════════════════════════╝",
    "",
    `Total Requests:  ${m.http_reqs?.values?.count || 0}`,
    `Avg Duration:    ${Math.round(m.http_req_duration?.values?.avg || 0)}ms`,
    `p95 Duration:    ${Math.round(m.http_req_duration?.values?.["p(95)"] || 0)}ms`,
    `p99 Duration:    ${Math.round(m.http_req_duration?.values?.["p(99)"] || 0)}ms`,
    `Error Rate:      ${((m.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`,
    "",
    `Recovery: System should stabilize within 30s of spike drop`,
  ];

  return {
    "k6/results-spike.json": JSON.stringify(data, null, 2),
    stdout: lines.join("\n") + "\n",
  };
}
