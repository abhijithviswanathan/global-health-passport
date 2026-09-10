let csrf: { token: string; headerName: string } | null = null;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const method = options.method || "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") {
    if (!csrf) {
      const r = await fetch("/api/csrf", {
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok)
        throw new ApiError("Unable to establish a secure session.", r.status);
      csrf = await r.json();
    }
    if (csrf) headers[csrf.headerName] = csrf.token;
    if (!(options.body instanceof FormData))
      headers["Content-Type"] = "application/json";
  }
  const r = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "same-origin",
    cache: "no-store",
    signal: options.signal ?? AbortSignal.timeout(15000),
    ...(options.body !== undefined
      ? {
          body:
            options.body instanceof FormData
              ? options.body
              : JSON.stringify(options.body),
        }
      : {}),
  });
  if (path.startsWith("/auth/")) csrf = null;
  if (!r.ok) {
    if (r.status === 403) csrf = null;
    const e = (await r.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      e.message ||
        e.error ||
        (r.status === 401
          ? "Please sign in to continue."
          : r.status === 403
            ? "Access is not authorized."
            : "The request could not be completed."),
      r.status,
    );
  }
  if (r.status === 204) return undefined as T;
  return r.json();
}
export type User = {
  id: string;
  username: string;
  role: string;
  name: string;
  displayName: string;
  healthId: string | null;
  organization: string;
};
export type ClinicalRecord = {
  id: string;
  patient_id: string;
  kind: string;
  title: string;
  details: string;
  author_id: string;
  author_name?: string;
  source: string;
  status: string;
  created_at: string;
  replaces_id?: string;
  related_id?: string;
  recipient_id?: string;
  quantity?: number;
  refills?: number;
  dosage?: string;
  route?: string;
  frequency?: string;
  duration?: string;
  [key: string]: unknown;
};
export type Consent = {
  id: string;
  patient_id: string;
  grantee_id: string;
  grantee_name: string;
  purpose: string;
  scopes: string;
  expires_at: string;
  status: string;
  created_at: string;
};
export type AccessRequest = {
  id: string;
  patient_id: string;
  requester_id: string;
  requester_name: string;
  purpose: string;
  status: string;
  created_at: string;
};
export type Audit = {
  id: string;
  action: string;
  actor_id: string;
  patient_id: string;
  resource_id: string;
  occurred_at: string;
  event_hash: string;
};
export const kinds: Record<string, string> = {
  allergy: "Allergies",
  condition: "Conditions",
  medication: "Medications",
  encounter: "Encounters",
  lab_order: "Lab orders",
  lab_result: "Lab results",
  prescription: "Prescriptions",
  dispense: "Dispensing",
  note: "Notes",
  imaging_report: "Imaging reports",
  document: "Uploaded documents",
};
export function date(value: string | undefined, time = false) {
  if (!value) return "Not recorded";
  const d = new Date(value);
  return Number.isNaN(d.valueOf())
    ? value
    : new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "short",
        day: "numeric",
        ...(time ? { hour: "numeric", minute: "2-digit" } : {}),
      }).format(d);
}
