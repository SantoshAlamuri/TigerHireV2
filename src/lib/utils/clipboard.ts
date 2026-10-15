/**
 * Copy text to clipboard using the Clipboard API.
 * Prefer this over document.execCommand("copy") which is deprecated and removed in some environments.
 * Returns true if successful; on failure (e.g. non-HTTPS, permission denied) returns false —
 * callers should show a fallback message like "Select the text and press Ctrl+C to copy".
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
