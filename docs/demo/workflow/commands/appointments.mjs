/** Appointments commands change one draft transaction and return user feedback. */
import { people } from "../../data.mjs";
import { requireRole, requireScope, find, requireStatus } from "../guards.mjs";

function inviteFollowup(context, input) {
  const { state, role, patient, at } = context;
  requireRole(role, "doctor");
  requireScope(state, patient, "care");
  if (
    state.appointments.some(
      (a) => a.patient === patient && a.status === "invited",
    )
  )
    throw new Error("A follow-up invitation is already awaiting a response.");
  const time = input.time || "10:30";
  if (!["10:30", "14:00"].includes(time))
    throw new Error("Choose one of the example appointment times.");
  if (
    state.appointments.some(
      (a) => a.time === time && ["invited", "confirmed"].includes(a.status),
    )
  )
    throw new Error(
      "That example time already has a pending or confirmed visit. Choose the other time.",
    );
  state.appointments.unshift({
    id: context.nextId("appointment"),
    patient,
    status: "invited",
    date: "18 September 2026",
    time,
    place: "NorthStar Clinic · Room 2",
    createdAt: at,
  });
  context.recordEvent(
    patient,
    "Follow-up invitation sent",
    `18 September · ${time} Eastern · awaiting patient confirmation.`,
  );
  context.notify(
    "patient",
    patient,
    "Dr Smith invited you to a follow-up",
    "Confirm the example appointment or ask for another time.",
    "appointments",
  );
  return "Follow-up invitation delivered to the patient.";
}

function replyFollowup(context, input) {
  const { state, role, patient } = context;
  requireRole(role, "patient");
  const a = find(state.appointments, input.id);
  if (a.patient !== patient)
    throw new Error("Choose your own example invitation.");
  requireStatus(a, "invited");
  if (!["confirmed", "reschedule_requested"].includes(input.status))
    throw new Error("Choose a valid response.");
  a.status = input.status;
  context.recordEvent(
    patient,
    input.status === "confirmed"
      ? "Follow-up confirmed"
      : "Another time requested",
    a.date + " · " + a.time + " Eastern.",
  );
  context.notify(
    "doctor",
    patient,
    input.status === "confirmed"
      ? "Follow-up confirmed"
      : "Patient requested another time",
    people[patient].name + " responded.",
    "appointments",
  );
  return "Your response is visible in the doctor’s schedule.";
}

export const appointmentsCommands = Object.freeze({
  "invite-followup": inviteFollowup,
  "reply-followup": replyFollowup,
});
