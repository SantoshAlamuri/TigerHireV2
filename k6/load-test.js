import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("errors");
const apiDuration = new Trend("api_duration");

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  stages: [
    { duration: "1m", target: 50 },
    { duration: "3m", target: 200 },
    { duration: "3m", target: 500 },
    { duration: "2m", target: 500 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<2000"],
    errors: ["rate<0.01"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const responses = http.batch([
    ["GET", `${BASE_URL}/api/health`, null, { tags: { name: "health" } }],
    ["GET", `${BASE_URL}/api/jobs?status=open&limit=10`, null, { tags: { name: "jobs_list" } }],
    ["GET", `${BASE_URL}/`, null, { tags: { name: "homepage" } }],
  ]);

  for (const res of responses) {
    const success = check(res, {
      "status is 200": (r) => r.status === 200,
      "response time < 500ms": (r) => r.timings.duration < 500,
    });
    errorRate.add(!success);
    apiDuration.add(res.timings.duration);
  }

  sleep(Math.random() * 2 + 1);
}

export function handleSummary(data) {
  return {
    "k6/results.json": JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}

function textSummary(data, opts) {
  const metrics = data.metrics;
  const lines = [
    "=== K6 Load Test Summary ===",
    `Total requests: ${metrics.http_reqs?.values?.count || 0}`,
    `Avg duration: ${Math.round(metrics.http_req_duration?.values?.avg || 0)}ms`,
    `p95 duration: ${Math.round(metrics.http_req_duration?.values?.["p(95)"] || 0)}ms`,
    `p99 duration: ${Math.round(metrics.http_req_duration?.values?.["p(99)"] || 0)}ms`,
    `Error rate: ${((metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`,
    `Peak VUs: ${data.state?.testRunDurationMs ? "see stages" : "unknown"}`,
  ];
  return lines.join("\n");
}
