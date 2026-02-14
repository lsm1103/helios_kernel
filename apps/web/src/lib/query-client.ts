export function createQueryKey(...parts: string[]): string {
  return parts.join(":");
}
