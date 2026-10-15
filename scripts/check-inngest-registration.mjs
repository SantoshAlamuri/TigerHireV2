/**
 * Ensures every `export const foo = inngest.createFunction(...)` in
 * `src/inngest/functions.ts` is registered in `src/app/api/inngest/route.ts`.
 * Prevents “implemented worker but never served” drift.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const functionsPath = path.join(root, "src/inngest/functions.ts");
const routePath = path.join(root, "src/app/api/inngest/route.ts");

function main() {
  const fnSrc = fs.readFileSync(functionsPath, "utf8");
  const routeSrc = fs.readFileSync(routePath, "utf8");

  const exported = [...fnSrc.matchAll(/export const (\w+)\s*=\s*inngest\.createFunction/g)].map(
    (m) => m[1],
  );

  const marker = "functions: [";
  const start = routeSrc.indexOf(marker);
  if (start === -1) {
    console.error("check-inngest-registration: could not find functions: [] in route.ts");
    process.exit(1);
  }
  const afterBracket = routeSrc.slice(start + marker.length);
  const end = afterBracket.search(/\n\s*\]/);
  if (end === -1) {
    console.error("check-inngest-registration: could not find end of functions: []");
    process.exit(1);
  }
  const inner = afterBracket.slice(0, end);
  const listed = [...inner.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\s*,?\s*$/gm)].map((m) => m[1]);

  const missing = exported.filter((name) => !listed.includes(name));
  if (missing.length > 0) {
    console.error(
      "Inngest functions exported but not passed to serve({ functions: [...] }):\n  - " +
        missing.join("\n  - "),
    );
    process.exit(1);
  }

  const extra = listed.filter((name) => !exported.includes(name));
  if (extra.length > 0) {
    console.error(
      "Route registers identifiers not exported from inngest/functions.ts:\n  - " +
        extra.join("\n  - "),
    );
    process.exit(1);
  }
}

main();
