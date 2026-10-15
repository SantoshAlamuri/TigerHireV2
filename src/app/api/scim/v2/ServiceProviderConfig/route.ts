import { NextResponse } from "next/server";
import { requireScimContext } from "@/lib/security/scim";

function authError(status: number, detail: string) {
  return NextResponse.json({ detail }, { status });
}

export async function GET(request: Request) {
  const auth = requireScimContext(request);
  if (!auth.ok) return authError(auth.status, auth.error ?? "Unauthorized");

  return NextResponse.json({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: "oauthbearertoken",
        name: "Bearer Token",
        description: "Static bearer token authentication for SCIM.",
        specUri: "https://www.rfc-editor.org/rfc/rfc7644",
        primary: true,
      },
    ],
  });
}
