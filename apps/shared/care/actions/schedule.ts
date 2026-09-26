/** Action builders for schedule; they describe forms but never grant server permission. */
import type { CareActionContext } from "./context";
import type { Action } from "../contracts";
import { patient } from "../definitions";
import { readable } from "../format";

export function newAppointment(input: CareActionContext): Action[] {
  const { role, tab } = input;
  const a: Action[] = [];

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
  return a;
}

export function appointmentStage(input: CareActionContext): Action[] {
  const { context } = input;
  const a: Action[] = [];

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
  return a;
}
