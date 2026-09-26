/** Care-team definitions: shared by the web and native renderers. */
import type { Field } from "./contracts";

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

export const patient: Field = {
  key: "patientId",
  label: "Patient",
  type: "select",
  source: "patients",
};

export const encounter: Field = {
  key: "encounterId",
  label: "Linked appointment / encounter",
  type: "select",
  source: "appointments",
  optional: true,
};

export const scope: Field = {
  key: "scope",
  label: "Permission scope",
  type: "select",
  options: scopeKinds,
};

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
