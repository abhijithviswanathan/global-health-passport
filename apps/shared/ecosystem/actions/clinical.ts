/** Action builders for clinical; they describe forms but never grant server permission. */
import type { EcosystemActionContext } from "./context";
import type { Action, Row, Field } from "../../care/contracts";
import {
  f,
  select,
  choices,
  patient,
  encounter,
  time,
  form,
} from "../definitions";
import { readable } from "../../care/format";
import { actions as careActions } from "../../care-model";

export function createOrder(input: EcosystemActionContext): Action[] {
  const { role, section } = input;
  const out: Action[] = [];

  if (section === "Orders" && role === "doctor")
    out.push(
      form("order", "Create structured order", "/ecosystem/orders", [
        patient,
        encounter,
        choices("kind", "Order type", [
          "laboratory",
          "imaging",
          "medication",
          "procedure",
          "consultation",
          "therapy",
        ]),
        f("code", "Test, procedure or medication"),
        select("assigneeId", "Assigned service employee", "careStaff"),
        choices("priority", "Priority", ["routine", "high", "urgent"]),
        f("instructions", "Instructions", "long"),
        f("specimenType", "Specimen type", "text", true),
        f("modality", "Imaging modality", "text", true),
        f("dosage", "Medication dosage", "text", true),
        f("route", "Medication route", "text", true),
        f("frequency", "Medication frequency", "text", true),
        f("duration", "Medication duration", "text", true),
        { ...f("quantity", "Medication quantity", "number", true), value: 1 },
        { ...f("refills", "Refills", "number", true), value: 0 },
      ]),
    );
  return out;
}

export function nursingCare(input: EcosystemActionContext): Action[] {
  const { section } = input;
  const out: Action[] = [];

  if (section === "Nursing")
    out.push(
      form("nursing", "Document nursing care", "/ecosystem/nursing", [
        patient,
        encounter,
        choices("entryType", "Type of care", [
          "pain",
          "assessment",
          "observation",
          "intake_output",
          "medication_administration",
          "wound",
          "patient_status",
          "nursing_note",
        ]),
        time("observedAt", "Observed or administered"),
        f("details", "Observation and context", "long"),
        f("room", "Room or bed", "text", true),
        f("painScore", "Pain score (0–10)", "number", true),
        f("intakeMl", "Intake (mL)", "number", true),
        f("outputMl", "Output (mL)", "number", true),
        select("prescriptionId", "Authorized prescription", "records", true),
        f("dose", "Administered dose", "text", true),
        f("route", "Administration route", "text", true),
        f(
          "identityChecked",
          "I checked patient, prescription, dose, route and time",
          "check",
        ),
      ]),
    );
  return out;
}

export function sendHandoff(input: EcosystemActionContext): Action[] {
  const { section } = input;
  const out: Action[] = [];

  if (section === "Handoffs")
    out.push(
      form("handoff", "Prepare shift handoff", "/ecosystem/handoffs", [
        patient,
        encounter,
        select("incomingId", "Incoming care-team member", "careStaff"),
        ...[
          "patientStatus",
          "pendingTasks",
          "medications",
          "tests",
          "observations",
          "concerns",
        ].map((k) =>
          f(
            k,
            (
              {
                patientStatus: "Patient status",
                pendingTasks: "Pending tasks",
                medications: "Medication attention",
                tests: "Tests awaiting results",
                observations: "Important observations",
                concerns: "Escalation concerns",
              } as Row
            )[k],
            "long",
          ),
        ),
      ]),
    );
  return out;
}

export function careTask(input: EcosystemActionContext): Action[] {
  const { role, section } = input;
  const out: Action[] = [];

  if (section === "Work grid")
    out.push(
      ...careActions(role, "Tasks").map((a) => ({
        ...a,
        fields: [
          ...a.fields,
          f("taskType", "Clinical task type", "text", true),
          f("location", "Room / location", "text", true),
          {
            ...f("dependencies", "Prerequisite tasks", "multi", true),
            source: "tasks",
          },
        ],
      })),
    );
  return out;
}

export function receiveHandoff(input: EcosystemActionContext): Action[] {
  const { section, d, selected } = input;
  const out: Action[] = [];
  const s = selected;
  if (!s) return out;
  if (
    section === "Handoffs" &&
    s.incoming_id === d.userId &&
    s.status === "sent"
  )
    out.push(
      form(
        "ack",
        "Acknowledge handoff",
        `/ecosystem/handoffs/${s.id}/acknowledge`,
        [],
        { version: s.version },
      ),
    );
  return out;
}

export function selectedCareTask(input: EcosystemActionContext): Action[] {
  const { role, section, d, selected } = input;
  const out: Action[] = [];
  const s = selected;
  if (!s) return out;
  if (section === "Work grid")
    out.push(...careActions(role, "", { task: s, userId: d.userId }));
  return out;
}

export function progressOrder(input: EcosystemActionContext): Action[] {
  const { role, section, d, selected } = input;
  const out: Action[] = [];
  const s = selected;
  if (!s) return out;
  if (section === "Orders") {
    const flow =
      s.kind === "laboratory"
        ? [
            "ordered",
            "accepted",
            "specimen_collected",
            "processing",
            "result_pending",
            "result_ready",
            "reviewed",
            "completed",
          ]
        : s.kind === "imaging"
          ? [
              "ordered",
              "scheduled",
              "patient_arrived",
              "imaging",
              "study_available",
              "interpretation",
              "result_ready",
              "report_signed",
              "reviewed",
              "completed",
            ]
          : ["ordered", "accepted", "in_progress", "completed"];
    const next = flow[flow.indexOf(s.status) + 1];
    const authorized =
      s.assigned_id === d.userId ||
      (role === "nurse" && next === "specimen_collected") ||
      (role === "doctor" && ["reviewed", "report_signed"].includes(next));
    if (next && authorized) {
      const fields: Field[] = [];
      if (next === "specimen_collected")
        fields.push(
          f("patientHealthId", "Confirm patient Health ID"),
          f("specimenCode", "Scan or enter specimen code"),
          time("observedAt", "Collected"),
        );
      if (next === "study_available")
        fields.push(f("studyUid", "DICOM Study Instance UID"));
      if (next === "result_ready")
        fields.push(
          f("report", "Result report", "long"),
          time("observedAt", "Observation"),
          f("critical", "Flag critical result for clinician review", "check"),
        );
      if (["reviewed", "report_signed"].includes(next))
        fields.push(
          f("review", "Review and next steps", "long"),
          f("reviewed", "I reviewed this result", "check"),
        );
      out.push(
        form(
          "orderstatus",
          `Move to ${readable(next)}`,
          `/ecosystem/orders/${s.id}`,
          fields,
          { version: s.version, status: next },
          "PATCH",
        ),
      );
    }
  }
  return out;
}
