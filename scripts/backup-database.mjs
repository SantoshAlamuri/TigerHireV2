#!/usr/bin/env node
/** Paginated supplemental exports. Not a transactional database backup or PITR substitute. */
import { mkdirSync, writeFileSync, appendFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { backupStorage } from "./backup-storage.mjs";

export const TABLES = [
  "profiles",
  "organisations",
  "candidates",
  "jobs",
  "applications",
  "pipeline_candidates",
  "fit_scores",
  "hiring_requests",
  "user_audit_log",
];

export function backupConfiguration(env) {
  // Never silently reuse CI's preview credentials for a production backup.
  const url = new URL(env.BACKUP_SUPABASE_URL ?? "");
  const project = env.BACKUP_PROJECT_REF;
  if (!project || url.origin !== `https://${project}.supabase.co` || url.pathname !== "/") {
    throw new Error("BACKUP_SUPABASE_URL must match BACKUP_PROJECT_REF exactly");
  }
  const key = env.BACKUP_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing BACKUP_SERVICE_ROLE_KEY");
  if (key.split(".").length === 3) {
    const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
    if (claims.ref !== project || claims.role !== "service_role") {
      throw new Error("Backup key project/role mismatch");
    }
  }
  return { url: url.origin, key, project };
}

export async function exportTable({ url, key }, table, output, fetcher = fetch) {
  if (!/^[a-z_]+$/.test(table)) throw new Error("Invalid table name");
  writeFileSync(output, "[", { mode: 0o600 });
  let offset = 0;
  let expected;
  let lastId;
  while (true) {
    const res = await fetcher(
      `${url}/rest/v1/${table}?select=*&order=id.asc&offset=${offset}&limit=1000`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!res.ok) throw new Error(`Export ${table} failed (HTTP ${res.status})`);
    const total = Number(res.headers.get("content-range")?.split("/")[1]);
    if (!Number.isSafeInteger(total) || total < 0)
      throw new Error(`Missing exact count for ${table}`);
    if (expected !== undefined && total !== expected)
      throw new Error(`Table changed during export: ${table}; retry`);
    expected = total;
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error(`Invalid rows for ${table}`);
    for (const row of rows) {
      const idIsSortable =
        (typeof row.id === "string" && row.id.length > 0) || Number.isSafeInteger(row.id);
      const orderIsStable =
        lastId === undefined || (typeof row.id === typeof lastId && row.id > lastId);
      if (!idIsSortable || !orderIsStable) {
        throw new Error(`Unstable pagination for ${table}`);
      }
      appendFileSync(output, `${offset ? "," : ""}${JSON.stringify(row)}`);
      lastId = row.id;
      offset++;
    }
    if (offset === expected) break;
    if (!rows.length || offset > expected) throw new Error(`Incomplete export for ${table}`);
  }
  appendFileSync(output, "]\n");
  return { rows: offset, status: "ok" };
}

export async function runBackup(
  config,
  directory,
  { tables = TABLES, fetcher = fetch, storage = backupStorage } = {},
) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const summary = {
    project: config.project,
    startedAt: new Date().toISOString(),
    complete: false,
    tables: {},
  };
  for (const table of tables) {
    try {
      summary.tables[table] = await exportTable(
        config,
        table,
        join(directory, `${table}.json`),
        fetcher,
      );
    } catch (error) {
      summary.tables[table] = { status: "error", error: error.message };
    }
  }
  try {
    summary.storage = await storage(config, join(directory, "storage"));
  } catch (error) {
    summary.storage = { status: "error", error: error.message };
  }
  summary.complete =
    Object.values(summary.tables).every((t) => t.status === "ok") &&
    summary.storage.status === "ok";
  summary.finishedAt = new Date().toISOString();
  writeFileSync(join(directory, "summary.json"), JSON.stringify(summary, null, 2), { mode: 0o600 });
  if (!summary.complete) {
    console.error(JSON.stringify(summary, null, 2));
    throw new Error(
      "Backup incomplete; inspect summary.json. Previous successful backups retained.",
    );
  }
  return summary;
}

async function main() {
  const config = backupConfiguration(process.env);
  const root = resolve("backups");
  const directory = join(root, `backup-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  await runBackup(config, directory);
  console.log(`Backup complete for project ${config.project}: ${directory}`);
  // Prune only after a complete replacement exists.
  for (const old of readdirSync(root)
    .filter((name) => name.startsWith("backup-"))
    .sort()
    .reverse()
    .slice(30)) {
    rmSync(join(root, old), { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
