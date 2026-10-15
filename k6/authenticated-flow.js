import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  scenarios: {
    recruiter_flow: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 100 },
        { duration: "5m", target: 300 },
        { duration: "2m", target: 500 },
        { duration: "2m", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<1000"],
    http_req_failed: ["rate<0.05"],
  },
};

export default function () {
  // Simulate a recruiter browsing jobs, viewing candidates, checking pipeline
  const jobsRes = http.get(`${BASE_URL}/api/jobs?status=open&limit=20`, {
    tags: { name: "GET /api/jobs" },
  });
  check(jobsRes, { "jobs 200": (r) => r.status === 200 || r.status === 401 });
  sleep(1);

  const candidatesRes = http.get(`${BASE_URL}/api/candidates?limit=20`, {
    tags: { name: "GET /api/candidates" },
  });
  check(candidatesRes, {
    "candidates 200": (r) => r.status === 200 || r.status === 401,
  });
  sleep(0.5);

  const healthRes = http.get(`${BASE_URL}/api/health?ready=1`, {
    tags: { name: "GET /api/health" },
  });
  check(healthRes, { "health 200": (r) => r.status === 200 });
  sleep(Math.random() * 3 + 1);
}
