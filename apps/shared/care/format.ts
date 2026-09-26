/** Care-team format: shared by the web and native renderers. */
import type { Row } from "./contracts";

export const readable = (s: unknown) =>
  String(s ?? "Unknown").replaceAll("_", " ");

export function when(value: unknown, zone?: unknown) {
  if (!value) return "Unknown";
  try {
    return new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
      timeZone: typeof zone === "string" && zone ? zone : "UTC",
    }).format(new Date(String(value)));
  } catch {
    return String(value);
  }
}

export function measurements(value: unknown) {
  if (!value) return "";
  try {
    const m = typeof value === "string" ? JSON.parse(value) : value;
    const names: Row = {
      temperature_c: "Temperature (°C)",
      spo2_percent: "SpO₂ (%)",
      systolic_mmhg: "Systolic BP (mmHg)",
      diastolic_mmhg: "Diastolic BP (mmHg)",
      pulse_bpm: "Pulse (bpm)",
      height_cm: "Height (cm)",
      weight_kg: "Weight (kg)",
    };
    return Object.entries(m as Row)
      .map(([k, v]) => `${names[k] || readable(k)}: ${v}`)
      .join(" · ");
  } catch {
    return "Measurements unavailable";
  }
}

export function provenanceLines(r: Row) {
  return [
    r.freshness_label || "Observation date unknown",
    measurements(r.measurements),
    r.kind === "vital"
      ? `Last measured ${r.age_minutes == null ? "at an unknown time" : r.age_minutes < 60 ? `${r.age_minutes} minutes ago` : r.age_minutes < 1440 ? `${Math.floor(r.age_minutes / 60)} hours ago` : `${Math.floor(r.age_minutes / 1440)} days ago`}`
      : "",
    `Observed: ${when(r.observed_at, r.observed_timezone)} · Timezone: ${r.observed_timezone || "Unknown"}`,
    r.observed_at ? `Source timestamp: ${r.observed_at}` : "",
    `Entered: ${when(r.created_at)} · Updated: ${when(r.updated_at)}`,
    `By ${r.author_name || "Unknown"} · Role: ${r.author_role || "Unknown"} · Organization: ${r.author_organization || "Unknown"} · Clinic: ${r.author_clinic || "Unknown"} · Department: ${r.author_department || "Unknown"}`,
    `Source: ${readable(r.source_type)} · ${r.source || "Unknown"}`,
    `State: ${readable(r.note_state || r.status)}`,
    r.original_record_id ? `Original record: ${r.original_record_id}` : "",
    ...(r.confirmations || []).map(
      (c: Row) =>
        `Confirmed current by ${c.actor_name || c.actor_id} at ${c.confirmed_at}. Original observation time retained. ${c.comment}`,
    ),
  ].filter(Boolean);
}
