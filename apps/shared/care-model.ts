/** Stable facade for web/native care workflows. Implementations are grouped by responsibility in care/. */
export type { Row, Field, Action } from "./care/contracts";
export {
  careRoles,
  scopeKinds,
  recordKinds,
  roleDescription,
} from "./care/definitions";
export { readable, when, measurements, provenanceLines } from "./care/format";
export { actions } from "./care/actions";
export { payload, options, initial, visibleFields } from "./care/forms";
