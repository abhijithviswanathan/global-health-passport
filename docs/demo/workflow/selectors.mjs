/** Read-only queries shared by the workflow engine and presentation. */
import { demoStart } from "../data.mjs";
export const timeNow = (state) => demoStart + state.tick * 60000;
export const grantFor = (state, patient) =>
  state.grants.find(
    (g) => g.patient === patient && g.expiresAt > timeNow(state),
  );
export const hasScope = (state, patient, scope) =>
  !!grantFor(state, patient)?.scope.includes(scope);
export const unread = (state, role, patient) =>
  state.notifications.filter(
    (n) =>
      n.role === role &&
      !n.read &&
      (role !== "patient" || n.patient === patient),
  ).length;
export const auditFor = (state, patient) =>
  state.events.filter((e) => e.patient === patient);
