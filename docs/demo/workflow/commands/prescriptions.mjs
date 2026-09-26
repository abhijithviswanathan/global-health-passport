/** Prescriptions commands change one draft transaction and return user feedback. */
import { people, medicine } from "../../data.mjs";
import { requireRole, requireScope, find } from "../guards.mjs";

function issuePrescription(context, input) {
  const { state, role, patient, at } = context;
  requireRole(role, "doctor");
  requireScope(state, patient, "prescriptions");
  if (!input.reviewed)
    throw new Error("Confirm review of the example patient and prescription.");
  if (
    state.prescriptions.some(
      (r) => r.patient === patient && r.status !== "dispensed",
    )
  )
    throw new Error(
      "An active sample prescription already exists for this patient.",
    );
  state.prescriptions.unshift({
    id: context.nextId("rx"),
    patient,
    status: "sent",
    medicine: { ...medicine },
    createdAt: at,
    read: false,
  });
  context.recordEvent(
    patient,
    "Sample prescription issued",
    "DemoCare A · 10 mg · 5 example tablets · Harbor Pharmacy.",
  );
  context.notify(
    "patient",
    patient,
    "New prescription from Dr Smith",
    "Review the fictional directions and follow pharmacy progress.",
    "prescriptions",
  );
  context.notify(
    "pharmacy",
    patient,
    "Prescription received",
    people[patient].name + " · DemoCare A · review required.",
    "prescriptions",
  );
  return "Prescription sent to the patient and pharmacy demo inboxes.";
}

function ackPrescription(context, input) {
  const { state, role, patient } = context;
  requireRole(role, "patient");
  const rx = find(state.prescriptions, input.id);
  if (rx.patient !== patient)
    throw new Error("Choose your own example prescription.");
  if (rx.read) throw new Error("This prescription is already marked as seen.");
  rx.read = true;
  context.recordEvent(
    patient,
    "Prescription instructions viewed",
    rx.medicine.name + " · viewing is not a dose administration record.",
  );
  return "Marked as seen. No dose or medication administration was recorded.";
}

function advancePrescription(context, input) {
  const { state, role } = context;
  requireRole(role, "pharmacy");
  const rx = find(state.prescriptions, input.id);
  requireScope(state, rx.patient, "prescriptions");
  const next = { sent: "reviewed", reviewed: "ready", ready: "dispensed" }[
    rx.status
  ];
  if (!next)
    throw new Error("This sample prescription has already been dispensed.");
  if (!input.confirmed)
    throw new Error("Confirm the sample patient and prescription checks.");
  rx.status = next;
  context.recordEvent(
    rx.patient,
    "Pharmacy: " + next,
    rx.medicine.name + " · Pharmacist Davis · Harbor Pharmacy.",
  );
  context.notify(
    "patient",
    rx.patient,
    next === "ready"
      ? "Your prescription is ready"
      : next === "dispensed"
        ? "Collection recorded"
        : "Pharmacist reviewed your prescription",
    rx.medicine.name + " · fictional demonstration only.",
    "prescriptions",
  );
  if (next === "dispensed")
    context.notify(
      "doctor",
      rx.patient,
      "Prescription dispensed",
      people[rx.patient].name + " · sample collection completed.",
      "prescriptions",
    );
  return "Pharmacy status updated for the doctor and patient.";
}

export const prescriptionsCommands = Object.freeze({
  "issue-prescription": issuePrescription,
  "ack-prescription": ackPrescription,
  "advance-prescription": advancePrescription,
});
