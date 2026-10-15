export function isMissingTableError(error: unknown): boolean {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);

  return (
    raw.includes("PGRST205") ||
    raw.includes("Could not find the table") ||
    (raw.includes("relation") && raw.includes("does not exist"))
  );
}
