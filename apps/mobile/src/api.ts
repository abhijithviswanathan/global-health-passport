/**
 * Native HTTP adapter to the same Java API used by the web app. The configured
 * base URL excludes /api. Mutations fetch a CSRF token; release builds require HTTPS.
 * By default only top-level row keys are converted from snake_case to camelCase.
 * Shared care/ecosystem models need raw=true to retain their server-shaped contracts.
 */
// Clinical data and credentials are deliberately never written to AsyncStorage.
const baseUrl = (
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080"
).replace(/\/$/, "");
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  timeoutMs = 15000,
  raw = false,
): Promise<T> {
  if (!__DEV__ && !baseUrl.startsWith("https://"))
    throw new Error("A secure HTTPS server is required.");
  let csrfToken = "";
  if (method !== "GET") {
    const csrf = await request<{ token: string }>("/csrf");
    csrfToken = csrf.token;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api${path}`, {
      method,
      credentials: "include",
      signal: controller.signal,
      headers: {
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        Accept: "application/json",
        ...(method !== "GET" ? { "X-CSRF-TOKEN": csrfToken } : {}),
      },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
      cache: "no-store",
    });
    const text = await response.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("The server returned an unexpected response.");
    }
    if (!response.ok)
      throw new ApiError(
        typeof data.message === "string"
          ? data.message
          : typeof data.error === "string"
            ? data.error
            : "The request could not be completed.",
        response.status,
      );
    // Legacy patient/clinician screens use camelCase. Shared models opt out via raw=true;
    // this conversion is deliberately shallow, so nested objects keep their original keys.
    const normalize = (row: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
          value,
        ]),
      );
    return (
      raw
        ? data
        : Array.isArray(data)
          ? data.map(normalize)
          : data && typeof data === "object"
            ? normalize(data)
            : data
    ) as T;
  } finally {
    clearTimeout(timeout);
  }
}
export type User = {
  id: string;
  username: string;
  displayName: string;
  healthId: string;
  role: string;
};
export type Entry = {
  id: string;
  kind: string;
  title: string;
  details: string;
  source: string;
  status: string;
  createdAt: string;
  authorName?: string;
  relatedId?: string;
  clinicalStatus?: string;
};
export type Grant = {
  id: string;
  granteeId: string;
  granteeName?: string;
  purpose: string;
  scopes: string;
  expiresAt: string;
  status: string;
};
export type AccessRequest = {
  id: string;
  requesterId: string;
  requesterName?: string;
  purpose: string;
  status: string;
};
export type Audit = {
  id: string;
  action: string;
  actorName?: string;
  actorId?: string;
  resourceId: string;
  occurredAt: string;
};
