/** Access commands change one draft transaction and return user feedback. */
import { people, scopes } from "../../data.mjs";
import { grantFor } from "../selectors.mjs";
import { requireRole, find, requireStatus } from "../guards.mjs";

function requestAccess(context) {
  const { state, role, patient, at } = context;
  requireRole(role, "doctor");
  if (grantFor(state, patient))
    throw new Error(
      "Sharing is already active. The patient can change it in Requests & sharing.",
    );
  if (
    state.requests.some((r) => r.patient === patient && r.status === "pending")
  )
    throw new Error("An access request is already waiting for this patient.");
  state.requests.unshift({
    id: context.nextId("access"),
    patient,
    status: "pending",
    scope: Object.keys(scopes),
    requestedAt: at,
  });
  context.notify(
    "patient",
    patient,
    "Dr Smith requested access",
    "Choose which information to share and for how long.",
    "requests",
  );
  context.recordEvent(
    patient,
    "Access requested",
    "Dr Smith requested history, nursing coordination and prescriptions.",
  );
  return "Request delivered to the patient demo inbox.";
}

function decideAccess(context, input) {
  const { state, role, patient, at } = context;
  requireRole(role, "patient");
  const r = find(state.requests, input.id);
  requireStatus(r, "pending");
  if (r.patient !== patient)
    throw new Error("This request belongs to a different demo patient.");
  if (!["approved", "declined"].includes(input.decision))
    throw new Error("Choose approve or decline.");
  if (input.decision === "approved") {
    const chosen = [...new Set(input.scopes || [])];
    if (!chosen.length || chosen.some((x) => !r.scope.includes(x)))
      throw new Error("Select at least one of the requested scopes.");
    if (![1, 7, 30].includes(input.days))
      throw new Error("Choose a supported sharing duration.");
    state.grants = state.grants.filter((g) => g.patient !== patient);
    state.grants.push({
      patient,
      scope: chosen,
      expiresAt: at + input.days * 86400000,
    });
    context.recordEvent(
      patient,
      "Sharing approved",
      chosen.map((x) => scopes[x].title).join(", ") +
        ` · ${input.days} day(s).`,
    );
  } else
    context.recordEvent(
      patient,
      "Access request declined",
      "No additional information was shared.",
    );
  r.status = input.decision;
  context.notify(
    "doctor",
    patient,
    "Patient " + input.decision + " sharing",
    people[patient].name + " responded to your request.",
    "patients",
  );
  state.notifications
    .filter(
      (n) =>
        n.role === "patient" && n.patient === patient && n.view === "requests",
    )
    .forEach((n) => (n.read = true));
  return input.decision === "approved"
    ? "Sharing approved. Switch to the doctor to continue."
    : "Request declined. The chart stays closed.";
}

function revokeAccess(context) {
  const { state, role, patient } = context;
  requireRole(role, "patient");
  if (!grantFor(state, patient))
    throw new Error("There is no active sharing to revoke.");
  state.grants = state.grants.filter((g) => g.patient !== patient);
  context.recordEvent(
    patient,
    "Sharing revoked",
    "Future chart, nursing and prescription actions in this demo require a new approval.",
  );
  context.notify(
    "doctor",
    patient,
    "Patient revoked sharing",
    people[patient].name + " ended the demonstration grant.",
    "patients",
  );
  return "Sharing revoked. Existing historical entries remain in the patient record.";
}

export const accessCommands = Object.freeze({
  "request-access": requestAccess,
  "decide-access": decideAccess,
  "revoke-access": revokeAccess,
});
