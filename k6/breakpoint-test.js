import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const errorRate = new Rate("errors");
const apiDuration = new Trend("api_duration");
const breakpointMarker = new Counter("breakpoint_errors");

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

/**
 * Breakpoint test — continuously ramp up VUs until the system breaks.
 * Use ramping-arrival-rate to find the maximum throughput capacity.
 *
 * Abort conditions are configured in thresholds: when error rate
 * exceeds 30% or p99 exceeds 10s, the test aborts automatically.
 */
export const options = {
  scenarios: {
    breakpoint: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      preAllocatedVUs: 100,
      maxVUs: 2000,
      stages: [
        { duration: "1m", target: 50 },
        { duration: "2m", target: 200 },
        { duration: "2m", target: 500 },
        { duration: "2m", target: 1000 },
        { duration: "2m", target: 1500 },
        { duration: "1m", target: 2000 },
      ],
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: "rate<0.30", abortOnFail: true, delayAbortEval: "30s" }],
    http_req_duration: [{ threshold: "p(99)<10000", abortOnFail: true, delayAbortEval: "30s" }],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/health`, {
    tags: { name: "health" },
    timeout: "15s",
  });

  const ok = check(res, {
    "status < 500": (r) => r.status < 500,
    "duration < 10s": (r) => r.timings.duration < 10000,
  });

  errorRate.add(!ok);
  apiDuration.add(res.timings.duration);

  if (!ok) {
    breakpointMarker.add(1);
  }
}

export function handleSummary(data) {
  const m = data.metrics;
  const totalReqs = m.http_reqs?.values?.count || 0;
  const totalErrors = m.breakpoint_errors?.values?.count || 0;
  const rps = m.http_reqs?.values?.rate ? Math.round(m.http_reqs.values.rate) : "unknown";

  const lines = [
    "╔══════════════════════════════════════════════════╗",
    "║         K6 BREAKPOINT TEST SUMMARY              ║",
    "╚══════════════════════════════════════════════════╝",
    "",
    `Peak RPS:        ~${rps} req/s`,
    `Total Requests:  ${totalReqs}`,
    `Total Errors:    ${totalErrors}`,
    `Avg Duration:    ${Math.round(m.http_req_duration?.values?.avg || 0)}ms`,
    `p95 Duration:    ${Math.round(m.http_req_duration?.values?.["p(95)"] || 0)}ms`,
    `p99 Duration:    ${Math.round(m.http_req_duration?.values?.["p(99)"] || 0)}ms`,
    `Max Duration:    ${Math.round(m.http_req_duration?.values?.max || 0)}ms`,
    `Error Rate:      ${((m.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`,
    "",
    "The breakpoint is the RPS at which error rate > 30% or p99 > 10s.",
    "If the test completed without aborting, the system handled all stages.",
  ];

  return {
    "k6/results-breakpoint.json": JSON.stringify(data, null, 2),
    stdout: lines.join("\n") + "\n",
  };
}
