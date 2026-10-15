/** Preserve explicit application context until the authorized list has loaded. */
export function resolveApplicationSelection(
  selectedId: string,
  applications: { id: string }[],
  loading: boolean,
): string {
  if (loading) return selectedId;
  return applications.some((row) => row.id === selectedId)
    ? selectedId
    : (applications[0]?.id ?? "");
}
