const lastCallByDomain = new Map<string, number>();

export async function throttleDomain(domain: string, minDelayMs = 2000): Promise<void> {
  const now = Date.now();
  const last = lastCallByDomain.get(domain) ?? 0;
  const waitFor = minDelayMs - (now - last);
  if (waitFor > 0) {
    await sleep(waitFor);
  }
  lastCallByDomain.set(domain, Date.now());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
