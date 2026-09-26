/** Tour progress follows workflow outcomes rather than page visits. */
import { scopes } from "../data.mjs";
import { grantFor, hasScope } from "./selectors.mjs";
export function tourSteps(s) {
  const rx = s.prescriptions.find((r) => r.patient === 0);
  return [
    {
      title: "Doctor asks to share",
      detail: "Send Alice a clear request for specific information.",
      role: "doctor",
      view: "patients",
      done: s.requests.some((r) => r.patient === 0),
    },
    {
      title: "Patient decides",
      detail:
        "As Alice, approve all three demo scopes to continue the complete story.",
      role: "patient",
      view: "requests",
      done:
        !!grantFor(s, 0) && Object.keys(scopes).every((x) => hasScope(s, 0, x)),
    },
    {
      title: "Doctor assigns the nurse",
      detail: "Send the pre-visit observations task to Nurse Williams.",
      role: "doctor",
      view: "requests",
      done: s.tasks.some((t) => t.patient === 0 && t.type === "vitals"),
    },
    {
      title: "Nurse receives & completes",
      detail: "Accept, start and file the sample observations.",
      role: "nurse",
      view: "queue",
      done: s.tasks.some(
        (t) =>
          t.patient === 0 && t.type === "vitals" && t.status === "completed",
      ),
    },
    {
      title: "Doctor issues a prescription",
      detail: "Review and send the invented medicine example.",
      role: "doctor",
      view: "prescriptions",
      done: !!rx,
    },
    {
      title: "Patient sees the directions",
      detail: "Open the prescription and mark the instructions as seen.",
      role: "patient",
      view: "prescriptions",
      done: !!rx?.read,
    },
    {
      title: "Pharmacy prepares collection",
      detail: "Review, mark ready and record sample collection.",
      role: "pharmacy",
      view: "prescriptions",
      done: rx?.status === "dispensed",
    },
    {
      title: "Doctor invites a follow-up",
      detail: "Send Alice the example follow-up appointment.",
      role: "doctor",
      view: "appointments",
      done: s.appointments.some((a) => a.patient === 0),
    },
    {
      title: "Patient confirms",
      detail: "Confirm the invitation and see the shared timeline.",
      role: "patient",
      view: "appointments",
      done: s.appointments.some(
        (a) => a.patient === 0 && a.status === "confirmed",
      ),
    },
  ];
}
