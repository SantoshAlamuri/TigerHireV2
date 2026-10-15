export function candidateListState(params: URLSearchParams) {
  const rawPage = Number(params.get("page") ?? 1);
  return {
    page: Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    search: params.get("search") ?? "",
    filters: {
      fn: params.get("jobTitle") || undefined,
      location: params.get("location") || undefined,
      highIntentOnly: params.get("intent") === "high",
    },
    openJobs: (params.get("expanded") ?? "").split(",").filter(Boolean),
  };
}
export function patchWorkspaceQuery(current: string, patch: Record<string, string | undefined>) {
  const params = new URLSearchParams(current);
  for (const [key, value] of Object.entries(patch)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  return params.toString();
}
