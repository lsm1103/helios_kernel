export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:1999/api";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function hasApiPrefix(base: string): boolean {
  try {
    const parsed = new URL(base);
    const pathname = trimTrailingSlash(parsed.pathname);
    return pathname.endsWith("/api");
  } catch {
    return trimTrailingSlash(base).endsWith("/api");
  }
}

function buildUrl(base: string, path: string): string {
  const normalizedBase = trimTrailingSlash(base);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function fetchWithApiPrefixFallback(path: string, init?: RequestInit): Promise<Response> {
  const primaryUrl = buildUrl(apiBaseUrl, path);
  let response = await fetch(primaryUrl, init);

  const shouldRetry =
    response.status === 404 &&
    !hasApiPrefix(apiBaseUrl) &&
    (path.startsWith("/v1/") || path.startsWith("/internal/"));

  if (shouldRetry) {
    const fallbackUrl = buildUrl(`${trimTrailingSlash(apiBaseUrl)}/api`, path);
    response = await fetch(fallbackUrl, init);
  }

  return response;
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetchWithApiPrefixFallback(path);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status} (${path})`);
  }
  return (await response.json()) as T;
}

export async function postJson<TResponse, TBody = Record<string, unknown>>(
  path: string,
  body: TBody
): Promise<TResponse> {
  const response = await fetchWithApiPrefixFallback(path, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed with status ${response.status} (${path}): ${text}`);
  }

  return (await response.json()) as TResponse;
}
