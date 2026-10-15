import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const errorRate = new Rate("errors");
const apiDuration = new Trend("api_duration");
const timeouts = new Counter("timeouts");

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

/**
 * Stress test — push the system well beyond normal operating capacity.
 * Ramps aggressively to 1000 VUs to find the breaking point.
 */
export const options = {
  stages: [
    { duration: "30s", target: 100 },
    { duration: "1m", target: 500 },
    { duration: "2m", target: 1000 },
    { duration: "3m", target: 1000 },
    { duration: "1m", target: 500 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000", "p(99)<5000"],
    errors: ["rate<0.10"],
    http_req_failed: ["rate<0.10"],
  },
};

const endpoints = [
  { method: "GET", path: "/api/health", tag: "health" },
  { method: "GET", path: "/api/health?ready=1", tag: "health_ready" },
  { method: "GET", path: "/api/jobs?status=open&limit=10", tag: "jobs_list" },
  { method: "GET", path: "/", tag: "homepage" },
  { method: "GET", path: "/api/waitlist/count", tag: "waitlist_count" },
];

export default function () {
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  const url = `${BASE_URL}${endpoint.path}`;

  const res = http.request(endpoint.method, url, null, {
    tags: { name: endpoint.tag },
    timeout: "10s",
  });

  const success = check(res, {
    "status is not 5xx": (r) => r.status < 500,
    "response time < 5s": (r) => r.timings.duration < 5000,
    "response body is not empty": (r) => r.body && r.body.length > 0,
  });

  errorRate.add(!success);
  apiDuration.add(res.timings.duration);

  if (res.timings.duration >= 10000) {
    timeouts.add(1);
  }

  sleep(Math.random() * 0.5);
}

export function handleSummary(data) {
  const m = data.metrics;
  const lines = [
    "╔══════════════════════════════════════════════════╗",
    "║           K6 STRESS TEST SUMMARY                ║",
    "╚══════════════════════════════════════════════════╝",
    "",
    `Total Requests:  ${m.http_reqs?.values?.count || 0}`,
    `Avg Duration:    ${Math.round(m.http_req_duration?.values?.avg || 0)}ms`,
    `p50 Duration:    ${Math.round(m.http_req_duration?.values?.["p(50)"] || 0)}ms`,
    `p90 Duration:    ${Math.round(m.http_req_duration?.values?.["p(90)"] || 0)}ms`,
    `p95 Duration:    ${Math.round(m.http_req_duration?.values?.["p(95)"] || 0)}ms`,
    `p99 Duration:    ${Math.round(m.http_req_duration?.values?.["p(99)"] || 0)}ms`,
    `Max Duration:    ${Math.round(m.http_req_duration?.values?.max || 0)}ms`,
    `Error Rate:      ${((m.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`,
    `Timeouts:        ${m.timeouts?.values?.count || 0}`,
    "",
    "Thresholds:",
    `  p95 < 2000ms:  ${(m.http_req_duration?.values?.["p(95)"] || 0) < 2000 ? "PASS ✓" : "FAIL ✗"}`,
    `  p99 < 5000ms:  ${(m.http_req_duration?.values?.["p(99)"] || 0) < 5000 ? "PASS ✓" : "FAIL ✗"}`,
    `  Errors < 10%:  ${(m.http_req_failed?.values?.rate || 0) < 0.1 ? "PASS ✓" : "FAIL ✗"}`,
  ];

  return {
    "k6/results-stress.json": JSON.stringify(data, null, 2),
    stdout: lines.join("\n") + "\n",
  };
}
