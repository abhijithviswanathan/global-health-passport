/**
 * Native adapter: HTTPS in release, cookie credentials and fresh CSRF for each write.
 * Legacy screens use shallow camelCase rows; shared workspaces opt into raw server keys.
 * Clinical data and credentials are never written to AsyncStorage.
 */
import {
  HttpClient,
  FreshCsrfPolicy,
  nativeJson,
} from "../../shared/http-client";
export { ApiError } from "../../shared/http-client";

const baseUrl = (
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080"
).replace(/\/$/, "");
const client = new HttpClient({
  baseUrl: `${baseUrl}/api`,
  credentials: "include",
  csrf: new FreshCsrfPolicy(),
  csrfHeaderName: "X-CSRF-TOKEN",
  contentTypeOnRead: true,
  decode: nativeJson,
  assertTransport: () => {
    if (!__DEV__ && !baseUrl.startsWith("https://"))
      throw new Error("A secure HTTPS server is required.");
  },
});

function normalizeRow(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value,
    ]),
  );
}

export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  timeoutMs = 15000,
  raw = false,
): Promise<T> {
  const data = await client.request<unknown>(path, { method, body, timeoutMs });
  return (
    raw
      ? data
      : Array.isArray(data)
        ? data.map(normalizeRow)
        : data && typeof data === "object"
          ? normalizeRow(data as Record<string, unknown>)
          : data
  ) as T;
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
