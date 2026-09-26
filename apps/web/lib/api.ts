/** Browser adapter: same-origin cookies, session-cached CSRF and unchanged server field names. */
import {
  HttpClient,
  CachedCsrfPolicy,
  browserJson,
} from "../../shared/http-client";
export { ApiError } from "../../shared/http-client";

const client = new HttpClient({
  baseUrl: "/api",
  credentials: "same-origin",
  csrf: new CachedCsrfPolicy(),
  decode: browserJson,
  csrfErrorMessage: "Unable to establish a secure session.",
  messageForStatus: (status) =>
    status === 401
      ? "Please sign in to continue."
      : status === 403
        ? "Access is not authorized."
        : "The request could not be completed.",
});

export function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  return client.request<T>(path, options);
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
  vital: "Vitals",
  history: "Medical history",
  nursing_observation: "Nursing observations",
  imaging_order: "Imaging requests",
  referral: "Referrals",
  follow_up: "Follow-up",
  discharge: "Discharge",
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
