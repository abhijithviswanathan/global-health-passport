/* eslint-disable @typescript-eslint/no-explicit-any -- API rows vary by permission-scoped resource. */
// Shared workflow contracts used by the web and native mobile workspaces.
export type Row = Record<string, any>;
export type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "long"
    | "select"
    | "multi"
    | "number"
    | "check"
    | "datetime"
    | "password";
  options?: string[];
  source?: string;
  optional?: boolean;
  value?: any;
};
export type Action = {
  id: string;
  label: string;
  path: string;
  method?: string;
  fields: Field[];
  fixed?: Row;
};
export const careRoles = [
  "doctor",
  "nurse",
  "reception",
  "lab",
  "diagnostic",
  "coordinator",
  "admin",
  "pharmacy",
];
export const scopeKinds = [
  "registration",
  "vital",
  "history",
  "nursing_observation",
  "allergy",
  "condition",
  "medication",
  "encounter",
  "note",
  "lab_order",
  "lab_result",
  "imaging_order",
  "imaging_report",
  "prescription",
  "dispense",
  "document",
  "referral",
  "follow_up",
  "discharge",
];
export const recordKinds: Record<string, string[]> = {
  doctor: [
    "vital",
    "history",
    "note",
    "encounter",
    "allergy",
    "condition",
    "medication",
    "lab_order",
    "imaging_order",
    "prescription",
    "referral",
    "follow_up",
    "discharge",
  ],
  nurse: ["vital", "history", "nursing_observation"],
  lab: ["lab_result", "imaging_report"],
  diagnostic: ["imaging_report"],
  pharmacy: ["dispense"],
};
const patient: Field = {
  key: "patientId",
  label: "Patient",
  type: "select",
  source: "patients",
};
const encounter: Field = {
  key: "encounterId",
  label: "Linked appointment / encounter",
  type: "select",
  source: "appointments",
  optional: true,
};
const scope: Field = {
  key: "scope",
  label: "Permission scope",
  type: "select",
  options: scopeKinds,
};
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
export function actions(
  role: string,
  tab: string,
  context: Row = {},
): Action[] {
  const a: Action[] = [];
  if (tab === "Patients" && recordKinds[role])
    a.push({
      id: "record",
      label: "Add patient record",
      path: "/care/records",
      fields: [
        patient,
        encounter,
        {
          key: "kind",
          label: "Record type",
          type: "select",
          options: recordKinds[role],
        },
        { key: "title", label: "Title" },
        { key: "details", label: "Observation, history or note", type: "long" },
        {
          key: "observedAt",
          label: "When observed (include UTC offset, or leave unknown)",
          type: "datetime",
          optional: true,
        },
        {
          key: "observedTimezone",
          label: "Timezone name (for example America/New_York)",
          optional: true,
        },
        {
          key: "sourceType",
          label: "Source type",
          type: "select",
          options: [
            "unknown",
            "patient_report",
            "nurse_observation",
            "clinician_observation",
            "device",
            "laboratory",
            "uploaded_document",
            "imported_record",
          ],
        },
        { key: "source", label: "Source details", optional: true },
        ...[
          "temperature_c",
          "spo2_percent",
          "systolic_mmhg",
          "diastolic_mmhg",
          "pulse_bpm",
          "height_cm",
          "weight_kg",
        ].map((key) => ({
          key: "vital_" + key,
          label: readable(key),
          type: "number" as const,
          optional: true,
        })),
        {
          key: "noteState",
          label: "Doctor note state",
          type: "select",
          options: ["signed", "draft"],
          optional: true,
        },
        {
          key: "relatedId",
          label: "Related order",
          type: "select",
          source: "records",
          optional: true,
        },
        {
          key: "recipientId",
          label: "Order recipient",
          type: "select",
          source: "staff",
          optional: true,
        },
        { key: "dosage", label: "Prescription dosage", optional: true },
        { key: "route", label: "Prescription route", optional: true },
        { key: "frequency", label: "Prescription frequency", optional: true },
        { key: "duration", label: "Prescription duration", optional: true },
        {
          key: "quantity",
          label: "Prescription / dispense quantity",
          type: "number",
          value: 1,
        },
        { key: "refills", label: "Refills", type: "number", value: 0 },
        {
          key: "historical",
          label: "This is historical information",
          type: "check",
        },
      ],
    });
  if (tab === "Tasks")
    a.push({
      id: "task",
      label: "Assign a task",
      path: "/care/tasks",
      fields: [
        { ...patient, optional: true },
        encounter,
        scope,
        { key: "title", label: "Task title" },
        { key: "details", label: "Instructions", type: "long" },
        {
          key: "assigneeId",
          label: "Assignee (leave blank for a team)",
          type: "select",
          source: "staff",
          optional: true,
        },
        {
          key: "team",
          label: "Team department (if no assignee)",
          optional: true,
        },
        {
          key: "priority",
          label: "Priority",
          type: "select",
          options: ["routine", "high", "urgent"],
        },
        {
          key: "dueAt",
          label: "Due date and time with UTC offset",
          type: "datetime",
          optional: true,
        },
        {
          key: "acknowledgeBy",
          label: "Acknowledge by (with UTC offset)",
          type: "datetime",
          optional: true,
        },
      ],
    });
  if (tab === "Messages")
    a.push({
      id: "conversation",
      label: "Start a conversation",
      path: "/care/conversations",
      fields: [
        { ...patient, optional: true },
        encounter,
        scope,
        {
          key: "kind",
          label: "Conversation type",
          type: "select",
          options: ["patient", "encounter", "direct", "group", "department"],
        },
        { key: "title", label: "Conversation title" },
        {
          key: "members",
          label: "Participants",
          type: "multi",
          source: "staff",
        },
      ],
    });
  if (
    tab === "Schedule" &&
    ["doctor", "reception", "coordinator", "admin"].includes(role)
  )
    a.push({
      id: "appointment",
      label: "Book appointment",
      path: "/care/appointments",
      fields: [
        patient,
        { key: "doctorId", label: "Doctor", type: "select", source: "staff" },
        {
          key: "startsAt",
          label: "Appointment date and time with UTC offset",
          type: "datetime",
        },
        {
          key: "duration",
          label: "Duration in minutes",
          type: "number",
          value: 30,
        },
        {
          key: "mode",
          label: "Visit mode",
          type: "select",
          options: ["in_person", "video"],
        },
      ],
    });
  if (tab === "Access" && ["admin", "coordinator"].includes(role))
    a.push({
      id: "assignment",
      label: "Assign patient access",
      path: "/care/assignments",
      fields: [
        { key: "healthId", label: "Patient Health ID" },
        {
          key: "staffId",
          label: "Staff member",
          type: "select",
          source: "staff",
        },
        {
          key: "scopes",
          label: "Work scopes (clinical access also requires patient consent)",
          type: "multi",
          options: scopeKinds,
        },
        {
          key: "expiresAt",
          label: "Assignment expiry with UTC offset",
          type: "datetime",
        },
        {
          key: "version",
          label: "Current assignment version (0 for a new assignment)",
          type: "number",
          value: 0,
        },
        {
          key: "active",
          label: "Access assignment active",
          type: "check",
          value: true,
        },
      ],
    });
  if (
    tab === "Patients" &&
    ["reception", "coordinator", "admin"].includes(role)
  )
    a.push({
      id: "registration",
      label: "Register existing patient at clinic",
      path: "/care/registration",
      fields: [{ key: "healthId", label: "Patient Health ID" }],
    });
  if (tab === "Access" && role === "admin")
    a.push({
      id: "provision",
      label: "Add staff account",
      path: "/care/staff",
      fields: [
        { key: "username", label: "Username" },
        { key: "name", label: "Full name" },
        {
          key: "role",
          label: "Role",
          type: "select",
          options: careRoles.filter((r) => r !== "admin"),
        },
        { key: "department", label: "Department" },
        {
          key: "password",
          label: "Initial password (12+ characters)",
          type: "password",
        },
      ],
    });
  if (tab === "Patients" && recordKinds[role])
    a.push({
      id: "request_access",
      label: "Request patient permission",
      path: "/access-requests",
      fixed: { purpose: "treatment" },
      fields: [{ key: "healthId", label: "Patient Health ID" }],
    });
  const r = context.record as Row | undefined;
  if (r) {
    if (["doctor", "nurse"].includes(role))
      a.push({
        id: "confirm",
        label: "Confirm still current",
        path: `/care/records/${r.id}/confirm`,
        fixed: { version: r.record_version },
        fields: [
          { key: "comment", label: "What did you verify?", type: "long" },
        ],
      });
    if (recordKinds[role]?.includes(r.kind)) {
      a.push({
        id: "carry",
        label: "Carry forward with original date",
        path: "/care/records",
        fixed: {
          patientId: r.patient_id,
          kind: r.kind,
          title: r.title,
          details: r.details,
          originalRecordId: r.id,
          measurements: r.measurements ? JSON.parse(r.measurements) : undefined,
        },
        fields: [],
      });
      if (r.author_id === context.userId && r.status === "active")
        a.push({
          id: "amend",
          label: "Create amendment",
          path: "/care/records",
          fixed: {
            patientId: r.patient_id,
            kind: r.kind,
            title: r.title,
            replacesId: r.id,
            observedAt: r.observed_at,
            observedTimezone: r.observed_timezone,
            sourceType: r.source_type,
            source: r.source,
            relatedId: r.related_id,
            recipientId: r.recipient_id,
          },
          fields: [
            {
              key: "details",
              label: "Corrected content",
              type: "long",
              value: r.details,
            },
            {
              key: "correctionReason",
              label: "Correction reason",
              type: "long",
            },
          ],
        });
    }
    if (
      role === "doctor" &&
      r.author_id === context.userId &&
      r.note_state === "draft"
    )
      a.push({
        id: "draft",
        label: "Edit or sign draft",
        path: `/care/records/${r.id}/draft`,
        method: "PATCH",
        fixed: { version: r.record_version },
        fields: [
          {
            key: "details",
            label: "Draft note",
            type: "long",
            value: r.details,
          },
          { key: "finalize", label: "Sign this note", type: "check" },
          {
            key: "reviewed",
            label: "I reviewed the patient and note",
            type: "check",
          },
        ],
      });
    if (
      role === "doctor" &&
      ["lab_result", "imaging_report"].includes(r.kind) &&
      !r.reviewed_at
    )
      a.push({
        id: "review",
        label: "Review result",
        path: `/care/results/${r.id}/review`,
        fields: [
          { key: "comment", label: "Review and next steps", type: "long" },
        ],
      });
    if (
      ["lab", "diagnostic", "pharmacy"].includes(role) &&
      r.recipient_id === context.userId
    )
      a.push({
        id: "service",
        label: "Update request status",
        path: `/care/services/${r.id}`,
        method: "PATCH",
        fixed: { version: r.service_version || 0 },
        fields: [
          {
            key: "status",
            label: "Next service status",
            type: "select",
            options: [
              "accepted",
              "specimen_collected",
              "examination_started",
              "processing",
              "clarification_requested",
              "result_posted",
            ],
          },
        ],
      });
  }
  const t = context.task as Row | undefined;
  if (t) {
    if (!t.assignee_id || t.assignee_id === context.userId) {
      const next: Record<string, string[]> = {
        open: ["accepted", "cancelled", "escalated"],
        accepted: [
          "in_progress",
          "blocked",
          "waiting",
          "cancelled",
          "escalated",
        ],
        in_progress: [
          "completed",
          "blocked",
          "waiting",
          "cancelled",
          "escalated",
        ],
        blocked: ["in_progress", "cancelled"],
        waiting: ["in_progress", "cancelled"],
        escalated: ["in_progress", "cancelled"],
      };
      if (next[t.status])
        a.push({
          id: "taskstatus",
          label: t.status === "open" ? "Accept task" : "Update task",
          path: `/care/tasks/${t.id}`,
          method: "PATCH",
          fixed: { version: t.version },
          fields: [
            {
              key: "status",
              label: "Next status",
              type: "select",
              options: next[t.status],
            },
            {
              key: "comment",
              label: "Acknowledgment or progress",
              type: "long",
            },
          ],
        });
    }
    if (
      t.status === "completed" &&
      !t.verified_by &&
      t.creator_id === context.userId &&
      t.assignee_id !== context.userId
    )
      a.push({
        id: "verifytask",
        label: "Verify completed task",
        path: `/care/tasks/${t.id}/verify`,
        fixed: { version: t.version },
        fields: [
          { key: "comment", label: "Independent verification", type: "long" },
        ],
      });
    a.push(messageAction({ taskId: t.id }));
  }
  if (context.conversation)
    a.push(messageAction({ conversationId: context.conversation.id }));
  if (context.appointment) {
    const ap = context.appointment;
    const next: Record<string, string> = {
      registered: "checked_in",
      checked_in: "triage",
      triage: "consultation",
      consultation: "follow_up",
      follow_up: "discharged",
    };
    if (next[ap.workflow_stage])
      a.push({
        id: "stage",
        label: `Move to ${readable(next[ap.workflow_stage])}`,
        path: `/care/appointments/${ap.id}/stage`,
        method: "PATCH",
        fixed: { version: ap.version, stage: next[ap.workflow_stage] },
        fields: [],
      });
  }
  if (context.message && role === "doctor")
    a.push({
      id: "promote",
      label: "Record a reviewed clinical decision",
      path: `/care/messages/${context.message.id}/record`,
      fields: [
        { key: "title", label: "Decision title" },
        { key: "details", label: "Reviewed decision", type: "long" },
        {
          key: "reviewed",
          label: "I reviewed this decision for the patient record",
          type: "check",
        },
      ],
    });
  if (context.rule && role === "admin")
    a.push({
      id: "rule",
      label: "Edit freshness interval",
      path: `/care/freshness/${context.rule.kind}`,
      method: "PUT",
      fixed: { version: context.rule.version },
      fields: [
        {
          key: "minutes",
          label: "Freshness interval in minutes",
          type: "number",
          value: context.rule.minutes,
        },
      ],
    });
  if (context.member && role === "admin")
    a.push({
      id: "staff",
      label: "Update staff access",
      path: `/care/staff/${context.member.id}`,
      method: "PATCH",
      fixed: { version: context.member.staff_version },
      fields: [
        {
          key: "department",
          label: "Department",
          value: context.member.department,
        },
        {
          key: "active",
          label: "Staff access active",
          type: "check",
          value: context.member.staff_active,
        },
      ],
    });
  if (
    context.member &&
    role === "admin" &&
    ["doctor", "nurse", "lab", "diagnostic", "pharmacy"].includes(
      context.member.role,
    )
  )
    a.push({
      id: "verification",
      label: "Review clinical staff verification",
      path: `/organization/members/${context.member.id}/verification`,
      fields: [
        {
          key: "status",
          label: "Verification decision",
          type: "select",
          options: ["verified", "suspended"],
        },
        {
          key: "evidenceReference",
          label: "Verification evidence or suspension reason",
          type: "long",
        },
      ],
    });
  return a;
}
function messageAction(fixed: Row): Action {
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
export const roleDescription: Record<string, string> = {
  doctor: "Your patients, decisions and outstanding reviews.",
  nurse: "Direct observations, intake and care tasks.",
  reception: "Registration, appointments and a clear check-in queue.",
  lab: "Requests, specimens and results in one place.",
  diagnostic: "Examinations, reports and requests for clarification.",
  coordinator: "Keep assignments and patient flow moving.",
  admin: "Manage staff access and clinic operations.",
  pharmacy: "Linked prescriptions, dispensing and care coordination.",
};

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
