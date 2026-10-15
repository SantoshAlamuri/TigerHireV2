/**
 * TigerHire stress / load test (k6).
 *
 * Prerequisites:
 * - Install k6: https://grafana.com/docs/k6/latest/set-up/install-k6/
 * - Start app: npm run dev (or point BASE_URL to your deployment)
 *
 * Run:
 *   k6 run load/stress.js
 *   BASE_URL=https://staging.example.com k6 run load/stress.js
 *   k6 run --vus 200 --duration 2m load/stress.js
 *
 * Simulates: public pages, health, apply page, and optional login load.
 */

import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  scenarios: {
    // Ramp up to 50 VUs over 30s, hold 1m, then ramp to 100 for 30s (stress spike)
    stress: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "1m", target: 50 },
        { duration: "30s", target: 100 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "15s",
      gracefulStop: "10s",
      exec: "stressScenario",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<5000", "p(99)<10000"],
  },
};

export function stressScenario() {
  const endpoints = [
    { url: `${BASE_URL}/`, name: "homepage" },
    { url: `${BASE_URL}/api/health`, name: "health" },
    { url: `${BASE_URL}/about`, name: "about" },
    { url: `${BASE_URL}/pricing`, name: "pricing" },
    { url: `${BASE_URL}/login`, name: "login" },
    { url: `${BASE_URL}/apply/razorpay`, name: "apply" },
  ];

  const r = Math.floor(Math.random() * endpoints.length);
  const { url, name } = endpoints[r];

  const res = http.get(url, {
    tags: { name },
    timeout: "15s",
  });

  check(res, {
    [`${name} status 200 or 503`]: (r) => r.status === 200 || r.status === 503,
  });

  sleep(0.5 + Math.random() * 1.5);
}

export default function () {
  stressScenario();
}
