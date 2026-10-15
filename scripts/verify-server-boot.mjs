#!/usr/bin/env node
/**
 * Does the production server actually START?
 *
 * `next build` passing and 3977 unit tests passing both say nothing about
 * whether the server boots. On 2026-09-13 a dependency bump shipped with both
 * green and took production down: every server-rendered route 500'd while
 * static assets still served, because the server never came up. This is the
 * check that was missing.
 *
 * Boots `next start` against a real build, waits for /api/health, and fails
 * loudly with the server's own output if it never answers.
 *
 * Usage: node scripts/verify-server-boot.mjs [--port 3011] [--timeout 60]
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

// Default to a port the OS hands us. A fixed port is how this check lies: a
// server left over from an earlier run answers /api/health and the check
// reports on THAT, not on this build. It produced both a false pass and a
// false fail while being written.
async function freePort() {
  return await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.once("listening", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
    probe.listen(0, "127.0.0.1");
  });
}

const requestedPort = Number(argValue("--port", "0"));
const timeoutSeconds = Number(argValue("--timeout", "60"));
if (
  !Number.isInteger(requestedPort) ||
  requestedPort < 0 ||
  requestedPort > 65535 ||
  !Number.isFinite(timeoutSeconds) ||
  timeoutSeconds <= 0
) {
  console.error("Invalid port or timeout: use a port from 0 to 65535 and a positive timeout.");
  process.exit(1);
}
const PORT = requestedPort || (await freePort());
const TIMEOUT_MS = timeoutSeconds * 1000;
const HEALTH_URL = `http://127.0.0.1:${PORT}/api/health`;

if (!existsSync(".next/BUILD_ID")) {
  console.error("✖ No completed production build found. Run `npm run build` first.");
  process.exit(1);
}

// Let Next load its environment files with its own precedence/parsing rules.
// Invoke the installed CLI directly: killing an npx wrapper can leave its
// server child running and make a subsequent check verify the wrong process.
const nextCli = resolve("node_modules/next/dist/bin/next");
if (!existsSync(nextCli)) {
  console.error("✖ Local Next.js installation missing. Run `npm ci` first.");
  process.exit(1);
}

// When an explicit --port is given, refuse to run against one that is already
// occupied rather than trust whatever is listening on it.
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `✖ Port ${PORT} is already in use. Something else is listening there, and testing it would verify nothing about this build. Stop it, or pass --port with a free one.`,
      );
      process.exit(1);
    }
    reject(err);
  });
  probe.once("listening", () => probe.close(resolve));
  probe.listen(PORT, "127.0.0.1");
});

let output = "";
let startupFailure = false;
const capture = (data) => {
  output = (output + data.toString()).slice(-64_000);
  // Vercel logs demonstrated this error alongside HTTP 200 responses. A
  // liveness response alone cannot establish successful instrumentation.
  if (
    /Environment validation failed:|error occurred while loading instrumentation hook/i.test(output)
  ) {
    startupFailure = true;
  }
};
const child = spawn(
  process.execPath,
  [nextCli, "start", "--hostname", "127.0.0.1", "--port", String(PORT)],
  {
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
child.stdout.on("data", capture);
child.stderr.on("data", capture);

let exited = null;
child.on("exit", (code, signal) => {
  exited = signal ? `signal ${signal}` : `exit code ${code}`;
});
child.on("error", (err) => {
  exited = `spawn failed: ${err.message}`;
});

async function stopServer() {
  if (exited) return;
  child.kill("SIGTERM");
  for (let i = 0; i < 20 && !exited; i++) await delay(50);
  if (!exited) {
    child.kill("SIGKILL");
    for (let i = 0; i < 20 && !exited; i++) await delay(50);
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void stopServer().then(() => process.exit(signal === "SIGINT" ? 130 : 143));
  });
}

try {
  const startedAt = Date.now();
  let healthy = false;
  while (Date.now() - startedAt < TIMEOUT_MS) {
    if (exited) throw new Error(`the process died (${exited})`);
    if (startupFailure) throw new Error("startup validation or instrumentation failed");
    let res;
    let body;
    try {
      res = await fetch(HEALTH_URL, {
        redirect: "manual",
        signal: AbortSignal.timeout(Math.max(1, Math.ceil(TIMEOUT_MS - (Date.now() - startedAt)))),
      });
      body = await res.text();
    } catch {
      // Startup connection failures and stalled responses share the bounded
      // deadline. Do not swallow validation failures in this retry path.
      await delay(100);
      continue;
    }
    if (res.status !== 200) throw new Error(`/api/health answered HTTP ${res.status}`);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new Error("/api/health did not return JSON");
    }
    if (payload?.ok !== true) throw new Error("/api/health did not report ok: true");
    // Drain startup logs before accepting the response, including errors
    // emitted immediately after the request was served.
    await delay(250);
    if (startupFailure) throw new Error("startup validation or instrumentation failed");
    if (exited) throw new Error(`the process died (${exited})`);
    healthy = true;
    console.log(`✓ server booted in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    console.log('✓ GET /api/health -> 200 {"ok":true}');
    break;
  }
  if (!healthy) throw new Error(`/api/health never answered within ${timeoutSeconds}s`);
} catch (err) {
  console.error(`\n✖ SERVER DID NOT BOOT — ${err.message}\n`);
  console.error(
    output.split("\n").slice(-25).join("\n") || "(the server produced no output at all)",
  );
  process.exitCode = 1;
} finally {
  await stopServer();
}
