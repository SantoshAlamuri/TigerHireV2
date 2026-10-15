import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";

/**
 * GET /api/debug/env — Development only.
 * Returns whether ANTHROPIC_API_KEY is visible to the server (no secret value).
 * Use to verify .env.local is loaded after restarting the dev server.
 */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }
  const key = env.anthropicApiKey;
  const hasKey = Boolean(key && key.length > 0);
  const fromProcess = Boolean(
    (process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_KEY ?? "").trim().length > 0,
  );
  return NextResponse.json({
    anthropicKeySet: hasKey,
    processEnvHasKey: fromProcess,
    hint: hasKey
      ? "Key is set. If upload still fails, check the key is valid at console.anthropic.com."
      : "Add ANTHROPIC_API_KEY to .env.local in the project root, then restart the dev server (Ctrl+C, then npm run dev).",
  });
}
