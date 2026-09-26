/** Organization definitions: shared by the web and native renderers. */
import type { Action, Field, Row } from "../care/contracts";

export const f = (
  key: string,
  label: string,
  type: Field["type"] = "text",
  optional = false,
): Field => ({ key, label, type, optional });

export const select = (
  key: string,
  label: string,
  source: string,
  optional = false,
): Field => ({ ...f(key, label, "select", optional), source });

export const choices = (
  key: string,
  label: string,
  options: string[],
  optional = false,
): Field => ({ ...f(key, label, "select", optional), options });

export const patient = select("patientId", "Patient", "patients"),
  encounter = select("encounterId", "Encounter", "appointments", true),
  time = (key: string, label: string, optional = false) =>
    f(key, label + " (with UTC offset)", "datetime", optional);

export const form = (
  id: string,
  label: string,
  path: string,
  fields: Field[],
  fixed?: Row,
  method = "POST",
): Action => ({ id, label, path, fields, fixed, method });

export const jobs = [
  "physician",
  "surgeon",
  "resident",
  "fellow",
  "nurse",
  "nurse_practitioner",
  "physician_assistant",
  "medical_assistant",
  "laboratory_technician",
  "radiology_technician",
  "radiologist",
  "pharmacist",
  "therapist",
  "receptionist",
  "scheduler",
  "billing_staff",
  "department_manager",
  "hospital_administrator",
  "security_administrator",
];
