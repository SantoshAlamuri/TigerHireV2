import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

/** Export actual objects, not just storage.objects metadata. Hash filenames prevent path traversal. */
export async function backupStorage(
  config,
  directory,
  client = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(60_000) }),
    },
  }),
) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const { data: buckets, error } = await client.storage.listBuckets();
  if (error || !Array.isArray(buckets)) throw new Error("Could not enumerate storage buckets");
  const manifest = { buckets, objects: [] };
  let completedObjects = 0;
  for (const bucket of buckets) {
    const store = client.storage.from(bucket.id);
    const prefixes = [""];
    const seen = new Set();
    while (prefixes.length) {
      const prefix = prefixes.shift();
      let offset = 0;
      while (true) {
        const { data, error: listError } = await store.list(prefix, {
          limit: 100,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (listError || !Array.isArray(data))
          throw new Error(`Could not list storage bucket ${bucket.id}`);
        if (!data.length) break;
        const files = [];
        for (const entry of data) {
          const path = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (seen.has(path))
            throw new Error(`Storage changed during export in ${bucket.id}; retry`);
          seen.add(path);
          if (entry.id == null) {
            prefixes.push(path);
            continue;
          }
          files.push({ entry, path });
        }
        // Keep enough parallelism to make hundreds of small CV exports practical
        // without flooding Supabase Storage or holding a whole bucket in memory.
        for (let start = 0; start < files.length; start += 8) {
          const exported = await Promise.all(
            files.slice(start, start + 8).map(async ({ entry, path }) => {
              const file = createHash("sha256").update(`${bucket.id}/${path}`).digest("hex");
              const { data: blob, error: downloadError } = await store.download(path);
              if (downloadError || !blob)
                throw new Error(`Could not download object ${file.slice(0, 12)} in ${bucket.id}`);
              const bytes = Buffer.from(await blob.arrayBuffer());
              if (entry.metadata?.size != null && bytes.length !== Number(entry.metadata.size)) {
                throw new Error(
                  `Storage object ${file.slice(0, 12)} changed size in ${bucket.id}; retry`,
                );
              }
              const sha256 = createHash("sha256").update(bytes).digest("hex");
              writeFileSync(join(directory, file), bytes, { mode: 0o600 });
              return {
                bucket: bucket.id,
                path,
                file,
                bytes: bytes.length,
                sha256,
                contentType: blob.type,
              };
            }),
          );
          manifest.objects.push(...exported);
          completedObjects += exported.length;
          if (completedObjects % 50 === 0)
            console.log(`Exported ${completedObjects} storage objects`);
        }
        offset += data.length;
      }
    }
  }
  writeFileSync(join(directory, "manifest.json"), JSON.stringify(manifest, null, 2), {
    mode: 0o600,
  });
  return { status: "ok", buckets: buckets.length, objects: manifest.objects.length };
}
