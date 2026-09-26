/** Care-team forms: shared by the web and native renderers. */
import type { Action, Field, Row } from "./contracts";
import { readable } from "./format";

export function messageAction(fixed: Row): Action {
  return {
    id: "message",
    label: "Send message or comment",
    path: "/care/messages",
    fixed,
    fields: [
      { key: "body", label: "Message", type: "long" },
      {
        key: "priority",
        label: "Message priority",
        type: "select",
        options: ["routine", "urgent", "critical"],
      },
      {
        key: "mentions",
        label: "Mention participants",
        type: "multi",
        source: "staff",
        optional: true,
      },
      {
        key: "attachments",
        label: "Attach permitted patient record references",
        type: "multi",
        source: "records",
        optional: true,
      },
    ],
  };
}

export function payload(action: Action, values: Row, key: string) {
  const b: Row = { ...action.fixed, ...values };
  if (["record", "carry", "amend"].includes(action.id)) b.idempotencyKey = key;
  if (["task", "appointment", "message", "conversation"].includes(action.id))
    b.requestKey = key;
  for (const f of action.fields) {
    if (f.type === "number") b[f.key] = Number(b[f.key]);
    if (f.type === "multi" && !b[f.key]) b[f.key] = [];
    if (f.type === "check") b[f.key] = !!b[f.key];
    if (f.optional && b[f.key] === "") delete b[f.key];
  }
  if (b.noteState === "signed") delete b.noteState;
  const measures: Row = {};
  for (const f of action.fields.filter((f) => f.key.startsWith("vital_"))) {
    if (values[f.key] !== "" && values[f.key] != null)
      measures[f.key.slice(6)] = Number(values[f.key]);
    delete b[f.key];
  }
  if (b.kind === "vital" && Object.keys(measures).length)
    b.measurements = measures;
  return b;
}

export function options(field: Field, data: Row, records: Row[]) {
  if (field.options)
    return field.options.map((v) => ({ id: v, label: readable(v) }));
  const rows =
    field.source === "records"
      ? records.filter((r) => r.entry_type === "record" || r.kind)
      : field.source === "appointments"
        ? data.appointments || []
        : data[field.source || ""] || [];
  return rows
    .filter((r: Row) => (field.key === "doctorId" ? r.role === "doctor" : true))
    .map((r: Row) => ({
      id: r.id,
      label:
        r.name ||
        r.title ||
        (r.patient_name
          ? `${r.patient_name} · ${new Date(r.starts_at).toLocaleString()}`
          : r.id),
    }));
}

export function initial(a: Action, patientId: string) {
  return Object.fromEntries(
    a.fields.map((f) => [
      f.key,
      f.value ??
        (f.key === "patientId"
          ? patientId
          : f.type === "select"
            ? f.options?.[0] || ""
            : f.type === "multi"
              ? []
              : f.type === "check"
                ? false
                : ""),
    ]),
  );
}

export function visibleFields(a: Action, v: Row, role: string) {
  return a.fields.filter((f) => {
    if (a.id !== "record") return true;
    const k = v.kind;
    if (f.key.startsWith("vital_")) return k === "vital";
    if (f.key === "noteState")
      return role === "doctor" && ["note", "encounter"].includes(k);
    if (f.key === "relatedId")
      return ["lab_result", "imaging_report", "dispense"].includes(k);
    if (f.key === "recipientId")
      return ["lab_order", "imaging_order", "prescription"].includes(k);
    if (["dosage", "route", "frequency", "duration", "refills"].includes(f.key))
      return k === "prescription";
    if (f.key === "quantity") return ["prescription", "dispense"].includes(k);
    return true;
  });
}
