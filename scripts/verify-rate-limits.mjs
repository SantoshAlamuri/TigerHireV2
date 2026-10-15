#!/usr/bin/env node
/**
 * Burst-check rate limits on auth, apply, and scheduling routes.
 * Usage: LAUNCH_BASE_URL=https://tigerhire.io node scripts/verify-rate-limits.mjs
 */
const baseUrl = process.env.LAUNCH_BASE_URL ?? "https://tigerhire.io";

async function burst(label, fn, count) {
  const codes = [];
  for (let i = 0; i < count; i += 1) {
    codes.push(await fn());
  }
  const has429 = codes.some((c) => c === 429);
  const no5xx = codes.every((c) => c < 500);
  const pass = has429 && no5xx;
  console.log(`[${pass ? "PASS" : "FAIL"}] ${label}: ${codes.join(", ")}`);
  return { label, pass, codes };
}

async function postJson(path, body) {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    return res.status;
  } catch {
    return 0;
  }
}

async function get(path) {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      signal: AbortSignal.timeout(20000),
    });
    return res.status;
  } catch {
    return 0;
  }
}

async function run() {
  console.log(`Rate-limit verification against ${baseUrl}\n`);

  const results = [];

  results.push(
    await burst(
      "Auth login POST",
      () =>
        postJson("/api/auth/login", {
          email: "rate-limit-verify@tigerhire.io",
          password: "wrong-password",
        }),
      6,
    ),
  );

  results.push(
    await burst("Apply slug GET", () => get("/api/apply/rate-limit-verify-invalid-slug-xyz"), 70),
  );

  results.push(
    await burst(
      "Self-serve schedule GET (edge defense)",
      () => get("/api/schedule/self-serve/0000000000000000000000000000"),
      25,
    ),
  );

  const failed = results.filter((r) => !r.pass);
  if (failed.length > 0) {
    console.error(`\nFailed: ${failed.map((f) => f.label).join(", ")}`);
    process.exit(1);
  }
  console.log("\nAll rate-limit checks passed.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
