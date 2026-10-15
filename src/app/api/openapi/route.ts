import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { reportError } from "@/lib/observability/report-error";

/**
 * GET /api/openapi — serve the OpenAPI spec (YAML).
 * Spec source: docs/openapi.yaml.
 */
export async function GET() {
  try {
    const yamlPath = path.join(process.cwd(), "docs", "openapi.yaml");
    const yaml = await readFile(yamlPath, "utf-8");
    // Minimal YAML→JSON for the spec (no full parser): if we only have simple key: value, we could parse; for now return as text with content-type application/x-yaml so clients can use it.
    return new NextResponse(yaml, {
      headers: {
        "Content-Type": "application/x-yaml",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (err) {
    reportError(err, { route: "GET /api/openapi" });
    return NextResponse.json({ error: "OpenAPI spec not found" }, { status: 404 });
  }
}
