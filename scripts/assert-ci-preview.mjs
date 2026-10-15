#!/usr/bin/env node
// CI tests may write data. Require the exact verified preview project, not
// merely a URL that differs from production. Never print credential values.
const previewRef = "htdyomyhkvhcwoeodwas";
try {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (url.origin !== `https://${previewRef}.supabase.co`) {
    throw new Error("CI must target the verified TigerHire preview project");
  }
  for (const [name, role] of [
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon"],
    ["SUPABASE_SERVICE_ROLE_KEY", "service_role"],
  ]) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing ${name}`);
    let claims;
    try {
      claims = JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString());
    } catch {
      throw new Error(`${name} must be a preview legacy JWT key for this CI configuration`);
    }
    if (claims.ref !== previewRef || claims.role !== role) {
      throw new Error(`${name} does not match the preview project and expected role`);
    }
  }
  console.log(`CI database target verified: ${previewRef} (preview)`);
} catch (error) {
  console.error(`CI database check failed: ${error.message}`);
  process.exitCode = 1;
}
