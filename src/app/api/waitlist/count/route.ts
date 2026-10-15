import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";

const SEED = Math.max(0, parseInt(process.env.WAITLIST_COUNT_SEED ?? "0", 10) || 0);

export async function GET(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = await checkRateLimit({
    key: `waitlist-count:${ip}`,
    limit: 30,
    windowSecs: 60,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const admin = createSupabaseAdmin();
    const { count, error } = await admin
      .from("waitlist")
      .select("id", { count: "exact", head: true });

    if (error) {
      return NextResponse.json({ count: SEED });
    }

    return NextResponse.json({ count: (count ?? 0) + SEED });
  } catch {
    return NextResponse.json({ count: SEED });
  }
}
