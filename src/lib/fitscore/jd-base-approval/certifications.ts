const CERT_BENCHMARK_KEY = "certifications";

export function parseCertificationsFromBenchmarks(
  benchmarks: Record<string, string> | undefined,
): string[] {
  const raw = benchmarks?.[CERT_BENCHMARK_KEY]?.trim();
  if (!raw) return [];
  return raw
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function mergeCertificationsIntoBenchmarks(
  benchmarks: Record<string, string>,
  certifications: string[],
): Record<string, string> {
  const next = { ...benchmarks };
  if (certifications.length === 0) {
    delete next[CERT_BENCHMARK_KEY];
    return next;
  }
  next[CERT_BENCHMARK_KEY] = certifications.join("; ");
  return next;
}
