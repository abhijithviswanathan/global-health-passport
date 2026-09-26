/** Organization presentation: shared by the web and native renderers. */
import type { Action, Row } from "../care/contracts";
import { readable } from "../care/format";

export function fields(a: Action, v: Row) {
  return a.fields.filter((f) => {
    if (a.id === "nursing") {
      if (f.key === "painScore") return v.entryType === "pain";
      if (["intakeMl", "outputMl"].includes(f.key))
        return v.entryType === "intake_output";
      if (
        ["prescriptionId", "dose", "route", "identityChecked"].includes(f.key)
      )
        return v.entryType === "medication_administration";
    }
    if (a.id === "order") {
      if (f.key === "modality") return v.kind === "imaging";
      if (f.key === "specimenType") return v.kind === "laboratory";
      if (
        [
          "dosage",
          "route",
          "frequency",
          "duration",
          "quantity",
          "refills",
        ].includes(f.key)
      )
        return v.kind === "medication";
    }
    return true;
  });
}

export function title(r: Row) {
  return r.patient_name && r.code
    ? `${r.code} · ${r.patient_name}`
    : r.title ||
        r.plan_name ||
        r.name ||
        r.work_id ||
        readable(r.action || r.resource_type || r.id);
}

export function lines(section: string, r: Row) {
  switch (section) {
    case "Workforce":
      return [
        readable(r.kind),
        `${new Date(r.starts_at).toLocaleString()} → ${new Date(r.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        r.professional_role,
        r.public_booking ? "Public appointment slots" : "Internal schedule",
      ];
    case "Staff":
      return [
        readable(r.professional_role),
        `Work ID: ${r.work_id}`,
        `Employment: ${r.status} · Credentials: ${r.credential_status}`,
        r.department,
      ];
    case "Work grid":
      return [
        r.patient_name || "Operational task",
        r.assignee_name || r.team || "Team",
        r.location_label || "Location not specified",
        r.due_at ? "Due " + new Date(r.due_at).toLocaleString() : "No due time",
        `${readable(r.priority)} · ${readable(r.status)}`,
      ];
    case "Orders":
      return [
        readable(r.kind) + " · " + readable(r.status),
        r.assignee_name,
        `Priority: ${r.priority}`,
        r.specimen_code ? "Specimen: " + r.specimen_code : r.modality,
        r.critical ? "Critical result — review required" : "",
      ];
    case "Insurance":
      return [
        r.company,
        readable(r.coverage_order),
        `Effective ${r.effective_date || "unknown"} · Ends ${r.expiration_date || "unknown"}`,
        "Identifiers protected",
      ];
    case "Marketplace":
    case "Plans":
    case "Plan review":
      return [
        r.company || "",
        `${r.currency} ${r.monthly_premium}/month · Deductible ${r.deductible}`,
        `${r.network_type} · ${r.region}`,
        r.synthetic
          ? "Synthetic plan — not available for purchase"
          : "Participating plan",
        r.sponsored ? "SPONSORED" : "Organic listing",
      ];
    case "Hospitals":
      return [
        r.code,
        ...(r.care_team || []).map(
          (m: Row) =>
            `${m.name} · ${readable(m.role)} · ${m.department || "Care team"}`,
        ),
        ...(r.appointments || [])
          .slice(0, 5)
          .map(
            (a: Row) =>
              `${new Date(a.starts_at).toLocaleString()} · ${a.doctor} · ${readable(a.status)}`,
          ),
        ...(r.insurance_sharing || []).map(
          (s: Row) =>
            `Insurance: ${readable(s.purpose)} · ${s.status} · until ${new Date(s.expires_at).toLocaleDateString()}`,
        ),
        "Orders, reports and prescriptions are available in your Timeline.",
      ];
    case "Handoffs":
      return [
        r.patient_name,
        `${r.outgoing_name} → ${r.incoming_name}`,
        readable(r.status),
      ];
    case "Organization":
      return [readable(r.kind), r.details];
    default:
      return [
        r.code,
        readable(r.status || r.action || r.severity),
        r.created_at,
      ].filter(Boolean);
  }
}
