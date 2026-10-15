/**
 * Fetch a public URL and extract plain text from HTML for JD scraping.
 * Strips scripts/styles and tag markup; decodes common entities.
 * Note: Sites that render job content via JavaScript (e.g. LinkedIn) may not
 * return full text with a simple fetch — we only get the initial HTML.
 */

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2MB

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Strip HTML to plain text: remove script/style, replace tags with space, collapse whitespace.
 */
function htmlToText(html: string): string {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<[^>]+>/g, " ");
  text = decodeHtmlEntities(text);
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

/**
 * Fetch URL and return extracted plain text. Throws on invalid URL, timeout, or empty/short content.
 */
export async function fetchPageText(url: string): Promise<string> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("URL must be http or https");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TigerHire/1.0; +https://tigerhire.io)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`Page returned ${res.status}`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw new Error("URL did not return HTML");
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_BODY_BYTES) {
      throw new Error("Page is too large to process");
    }

    const html = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    const text = htmlToText(html);
    return text.trim();
  } finally {
    clearTimeout(timeoutId);
  }
}
