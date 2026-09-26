import { people, roles, demoStart } from "../data.mjs";
import { validPatient, requireRole } from "./guards.mjs";

/**
 * Unit of Work for one simulated action. State, events and notifications share the
 * same draft; only the engine publishes it after the command succeeds.
 */
export class WorkflowTransaction {
  constructor(state, role, patient) {
    requireRole(role, ...Object.keys(roles));
    if (patient !== undefined) validPatient(patient);
    this.state = structuredClone(state);
    this.role = role;
    this.patient = patient;
    this.at = demoStart + (this.state.tick + 1) * 60000;
  }

  nextId(prefix) {
    return `${prefix}-${++this.state.sequence}`;
  }

  recordEvent(patient, title, detail = "") {
    this.state.events.unshift({
      id: this.nextId("event"),
      patient,
      actor:
        this.role === "patient" ? people[patient].name : roles[this.role].name,
      title,
      detail,
      at: this.at,
    });
  }

  notify(role, patient, title, detail, view) {
    this.state.notifications.unshift({
      id: this.nextId("notice"),
      role,
      patient,
      title,
      detail,
      view,
      read: false,
      at: this.at,
    });
  }

  commit(feedback) {
    this.state.tick++;
    return { state: this.state, feedback };
  }
}
