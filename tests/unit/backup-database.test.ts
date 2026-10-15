// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupConfiguration, exportTable, runBackup } from "../../scripts/backup-database.mjs";
import { backupStorage } from "../../scripts/backup-storage.mjs";
const directories: string[] = [];
const config = { url: "https://preview.supabase.co", key: "test", project: "preview" };
function directory() {
  const dir = mkdtempSync(join(tmpdir(), "backup-test-"));
  directories.push(dir);
  return dir;
}
const page = (rows: unknown[], total: number) =>
  new Response(JSON.stringify(rows), { headers: { "content-range": `0-0/${total}` } });
afterEach(() =>
  directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })),
);

describe("supplemental database export", () => {
  it("continues after server-capped pages instead of silently truncating", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(page([{ id: "a" }], 3))
      .mockResolvedValueOnce(page([{ id: "b" }], 3))
      .mockResolvedValueOnce(page([{ id: "c" }], 3));
    const output = join(directory(), "jobs.json");
    expect(await exportTable(config, "jobs", output, fetcher)).toEqual({ rows: 3, status: "ok" });
    expect(JSON.parse(readFileSync(output, "utf8"))).toHaveLength(3);
    expect(fetcher.mock.calls[2][0]).toContain("offset=2");
  });
  it("supports monotonically increasing numeric primary keys", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(page([{ id: 1 }], 2))
      .mockResolvedValueOnce(page([{ id: 2 }], 2));
    const output = join(directory(), "user_audit_log.json");
    expect(await exportTable(config, "user_audit_log", output, fetcher)).toEqual({
      rows: 2,
      status: "ok",
    });
  });
  it("rejects changed totals and repeated pages", async () => {
    const output = join(directory(), "jobs.json");
    await expect(
      exportTable(
        config,
        "jobs",
        output,
        vi
          .fn()
          .mockResolvedValueOnce(page([{ id: "a" }], 2))
          .mockResolvedValueOnce(page([{ id: "b" }], 3)),
      ),
    ).rejects.toThrow("changed");
    await expect(
      exportTable(
        config,
        "jobs",
        output,
        vi.fn().mockImplementation(async () => page([{ id: "a" }], 2)),
      ),
    ).rejects.toThrow("Unstable pagination");
  });
  it("fails the backup and retains a failure summary when any table export fails", async () => {
    const dir = directory();
    await expect(
      runBackup(config, dir, {
        tables: ["jobs"],
        fetcher: vi.fn().mockResolvedValue(new Response("failed", { status: 500 })),
        storage: async () => ({ status: "ok" }),
      }),
    ).rejects.toThrow("Backup incomplete");
    const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(summary.complete).toBe(false);
    expect(summary.tables.jobs.status).toBe("error");
  });
  it("fails when storage export fails even if all tables succeeded", async () => {
    await expect(
      runBackup(config, directory(), {
        tables: ["jobs"],
        fetcher: vi.fn().mockResolvedValue(page([], 0)),
        storage: async () => {
          throw new Error("download failed");
        },
      }),
    ).rejects.toThrow("Backup incomplete");
  });
  it("refuses implicit CI credentials and wrong project keys", () => {
    expect(() =>
      backupConfiguration({
        NEXT_PUBLIC_SUPABASE_URL: config.url,
        SUPABASE_SERVICE_ROLE_KEY: "test",
      }),
    ).toThrow();
    const jwt = `x.${Buffer.from(JSON.stringify({ ref: "other", role: "service_role" })).toString("base64url")}.x`;
    expect(() =>
      backupConfiguration({
        BACKUP_SUPABASE_URL: config.url,
        BACKUP_PROJECT_REF: "preview",
        BACKUP_SERVICE_ROLE_KEY: jwt,
      }),
    ).toThrow("mismatch");
  });
});

describe("storage export", () => {
  it("exports nested object bytes with checksums and safe local filenames", async () => {
    const dir = directory();
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ name: "folder", id: null }], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [{ name: "cv.pdf", id: "object", metadata: { size: 3 } }],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null });
    const download = vi.fn().mockResolvedValue({ data: new Blob(["pdf"]), error: null });
    const client = {
      storage: {
        listBuckets: async () => ({ data: [{ id: "resumes" }], error: null }),
        from: () => ({ list, download }),
      },
    };
    expect(await backupStorage(config, dir, client)).toMatchObject({ status: "ok", objects: 1 });
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    expect(manifest.objects[0].path).toBe("folder/cv.pdf");
    expect(manifest.objects[0].file).toMatch(/^[a-f0-9]{64}$/);
    expect(readFileSync(join(dir, manifest.objects[0].file), "utf8")).toBe("pdf");
    expect(download).toHaveBeenCalledWith("folder/cv.pdf");
  });
  it("rejects inaccessible buckets", async () => {
    await expect(
      backupStorage(config, directory(), {
        storage: { listBuckets: async () => ({ data: null, error: new Error("denied") }) },
      }),
    ).rejects.toThrow("enumerate");
  });
  it("bounds concurrent storage downloads", async () => {
    let active = 0;
    let peak = 0;
    const entries = Array.from({ length: 9 }, (_, index) => ({
      name: `${index}.pdf`,
      id: `${index}`,
      metadata: { size: 3 },
    }));
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: entries, error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const download = vi.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return { data: new Blob(["pdf"]), error: null };
    });
    const result = await backupStorage(config, directory(), {
      storage: {
        listBuckets: async () => ({ data: [{ id: "resumes" }], error: null }),
        from: () => ({ list, download }),
      },
    });
    expect(result.objects).toBe(9);
    expect(peak).toBe(8);
  });
});
