/**
 * POST to an existing route whose URL depends on a row (a slot id), where a
 * fixed-URL `useApiMutation` does not fit. Same contract as use-api: cookies
 * included, `{ error }` bodies surfaced as the message.
 */
export async function postJson<T>(
  url: string,
  body?: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
    });
    const text = await res.text();
    let json: unknown = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      return { ok: false, error: "The server sent back something unreadable. Try again." };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: (json as { error?: string }).error ?? `Request failed (${res.status})`,
      };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and retry." };
  }
}
