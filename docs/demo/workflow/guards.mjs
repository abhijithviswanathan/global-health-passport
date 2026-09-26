/** Simulation invariants; public-demo controls are not real authentication. */
import { people } from "../data.mjs";
import { hasScope } from "./selectors.mjs";
export function requireRole(role, ...allowed) {
  if (!allowed.includes(role))
    throw new Error("Switch to the relevant demo perspective for this action.");
}
export function requireScope(state, patient, scope) {
  if (!hasScope(state, patient, scope))
    throw new Error(
      "The patient must approve this sharing scope first. Open Patient → Requests & sharing.",
    );
}
export function find(rows, id) {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error("This example is no longer available.");
  return row;
}
export function requireStatus(row, status) {
  if (row.status !== status)
    throw new Error(
      "This item has changed. Review its current status before continuing.",
    );
}
export function validPatient(patient) {
  if (!people.some((p) => p.id === patient))
    throw new Error("Choose a fictional patient.");
}
