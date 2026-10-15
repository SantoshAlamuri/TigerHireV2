#!/usr/bin/env node
/**
 * Quick stress run using autocannon (no k6 required).
 * Ensure app is running: npm run dev
 *
 * Usage: node scripts/stress-run.mjs [baseURL]
 *        BASE_URL=https://localhost:3000 node scripts/stress-run.mjs
 */

import autocannon from "autocannon";

const baseURL = process.env.BASE_URL || "http://localhost:3000";

const run = (opts) =>
  new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: baseURL,
        connections: 20,
        duration: 30,
        pipelining: 2,
        ...opts,
      },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    autocannon.track(instance, { renderProgressBar: true });
  });

async function main() {
  console.log("Target:", baseURL);
  console.log("Connections: 20, Duration: 30s, Pipelining: 2\n");

  const result = await run({});

  console.log("\n--- Summary ---");
  console.log("Requests:", result.requests.total);
  console.log("Latency p99 (ms):", result.latency.p99);
  console.log("Errors:", result.errors);
  console.log("Timeouts:", result.timeouts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
