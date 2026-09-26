/** Action builders for records; they describe forms but never grant server permission. */
import type { CareActionContext } from "./context";
import type { Action, Row } from "../contracts";
import { recordKinds, patient, encounter } from "../definitions";
import { readable } from "../format";

export function newRecord(input: CareActionContext): Action[] {
  const { role, tab } = input;
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
  return a;
}

export function registerPatient(input: CareActionContext): Action[] {
  const { role, tab } = input;
  const a: Action[] = [];

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
  return a;
}

export function readFreshnessRules(input: CareActionContext): Action[] {
  const { role, tab } = input;
  const a: Action[] = [];

  if (tab === "Patients" && recordKinds[role])
    a.push({
      id: "request_access",
      label: "Request patient permission",
      path: "/access-requests",
      fixed: { purpose: "treatment" },
      fields: [{ key: "healthId", label: "Patient Health ID" }],
    });
  return a;
}

export function selectedRecord(input: CareActionContext): Action[] {
  const { role, context } = input;
  const a: Action[] = [];

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
  return a;
}
