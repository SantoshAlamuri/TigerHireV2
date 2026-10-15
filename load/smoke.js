/**
 * TigerHire smoke test (k6) — light load to verify endpoints respond.
 *
 * Run: k6 run load/smoke.js
 *      BASE_URL=https://staging.example.com k6 run load/smoke.js
 */

import http from "k6/http";
import { check } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  vus: 10,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<3000"],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/health`, { timeout: "10s" });
  check(res, { "health ok": (r) => r.status === 200 && r.json("ok") === true });

  const home = http.get(`${BASE_URL}/`, { timeout: "10s" });
  check(home, { "homepage 200": (r) => r.status === 200 });
}
