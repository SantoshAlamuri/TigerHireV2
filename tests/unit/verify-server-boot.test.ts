// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const script = resolve("scripts/verify-server-boot.mjs");
const fixtures: string[] = [];

async function run(mode: string) {
  const cwd = await mkdtemp(join(tmpdir(), "tigerhire-boot-test-"));
  fixtures.push(cwd);
  await mkdir(join(cwd, ".next"));
  if (mode !== "missing-build") await writeFile(join(cwd, ".next/BUILD_ID"), "test-build");
  await mkdir(join(cwd, "node_modules/next/dist/bin"), { recursive: true });
  await writeFile(
    join(cwd, "node_modules/next/dist/bin/next"),
    `const http = require('node:http');
const mode = ${JSON.stringify(mode)};
const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
http.createServer((req,res) => {
  if (mode === 'startup-error') console.error('Error occurred while loading instrumentation hook: Environment validation failed: test configuration');
  if (mode === 'hung-body') { res.writeHead(200); res.write('{'); return; }
  if (mode === 'http-error') { res.writeHead(500); res.end('failed'); return; }
  if (mode === 'false-health') { res.end('{"ok":false}'); return; }
  if (mode === 'html-health') { res.end('<html>Login</html>'); return; }
  res.end('{"ok":true}');
}).listen(port, '127.0.0.1');
`,
  );
  try {
    const result = await exec(process.execPath, [script, "--timeout", "2"], {
      cwd,
      timeout: 8000,
      env: { PATH: process.env.PATH },
    });
    return { code: 0, ...result };
  } catch (error) {
    const result = error as Error & {
      code: number;
      stdout: string;
      stderr: string;
      killed?: boolean;
    };
    // A hung verifier must fail the test, not look like an expected nonzero exit.
    expect(result.killed).not.toBe(true);
    return result;
  }
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("production boot verification", () => {
  it("accepts a healthy server and exits after shutting it down", async () => {
    const result = await run("healthy");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("server booted");
  });

  it("rejects instrumentation failure even with HTTP 200 and ok true", async () => {
    const result = await run("startup-error");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("startup validation or instrumentation failed");
  });

  it.each([
    ["http-error", "HTTP 500"],
    ["false-health", "did not report ok: true"],
    ["html-health", "did not return JSON"],
    ["hung-body", "never answered within"],
    ["missing-build", "No completed production build"],
  ])("rejects %s", async (mode, message) => {
    const result = await run(mode);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(message);
  });
});
