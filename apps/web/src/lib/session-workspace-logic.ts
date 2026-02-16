export type SessionLifecycleStatus = "ACTIVE" | "ARCHIVED";

export function filterSessionsByArchive<T extends { status: SessionLifecycleStatus }>(
  sessions: T[],
  showArchived: boolean
): T[] {
  if (showArchived) {
    return sessions;
  }
  return sessions.filter((session) => session.status === "ACTIVE");
}

export function buildToolCardSummary(delta: Array<{ data: string }>, fallback: string): string {
  for (let index = delta.length - 1; index >= 0; index -= 1) {
    const normalized = delta[index]?.data?.trim();
    if (normalized) {
      return normalized.slice(0, 220);
    }
  }
  return fallback;
}
