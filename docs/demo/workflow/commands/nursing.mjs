/** Nursing commands change one draft transaction and return user feedback. */
import { people, taskTypes } from "../../data.mjs";
import { requireRole, requireScope, find } from "../guards.mjs";

function assignTask(context, input) {
  const { state, role, patient, at } = context;
  requireRole(role, "doctor");
  requireScope(state, patient, "care");
  if (!taskTypes[input.type]) throw new Error("Choose a supported task.");
  if (
    state.tasks.some(
      (t) =>
        t.patient === patient &&
        t.type === input.type &&
        !["completed", "declined"].includes(t.status),
    )
  )
    throw new Error("This patient already has that task in progress.");
  state.tasks.unshift({
    id: context.nextId("task"),
    patient,
    type: input.type,
    status: "requested",
    priority: input.priority === "Urgent" ? "Urgent" : "Routine",
    due: "10:00",
    createdAt: at,
  });
  context.recordEvent(
    patient,
    "Nursing request sent",
    taskTypes[input.type].title + " · assigned to Nurse Williams.",
  );
  context.notify(
    "nurse",
    patient,
    "New request from Dr Smith",
    people[patient].name + " · " + taskTypes[input.type].title,
    "queue",
  );
  context.notify(
    "patient",
    patient,
    "Your care team has a new task",
    "Nurse Williams will " +
      (input.type === "vitals"
        ? "record your sample observations."
        : input.type === "specimen"
          ? "coordinate a fictional blood sample."
          : "help coordinate your follow-up."),
    "timeline",
  );
  return "Request delivered to Nurse Williams. Open the nurse queue to accept it.";
}

function advanceTask(context, input) {
  const { state, role, at } = context;
  requireRole(role, "nurse");
  const t = find(state.tasks, input.id);
  requireScope(state, t.patient, "care");
  const next = {
    requested: "accepted",
    accepted: "in_progress",
    in_progress: "completed",
  }[t.status];
  if (!next) throw new Error("This task is already complete.");
  if (next === "completed" && !input.confirmed)
    throw new Error(
      "Review and confirm the fictional result before filing it.",
    );
  t.status = next;
  if (next === "completed") {
    t.completedAt = at;
    if (t.type === "vitals")
      state.observations.unshift({
        id: context.nextId("obs"),
        patient: t.patient,
        author: "Nurse Williams",
        observedAt: at - 60000,
        recordedAt: at,
        values: {
          temperature_c: 36.7,
          spo2_percent: 98,
          pulse_bpm: 74,
          systolic_mmhg: 116,
          diastolic_mmhg: 74,
        },
      });
    if (t.type === "specimen") {
      state.labs.unshift({
        id: context.nextId("lab"),
        patient: t.patient,
        status: "received",
        createdAt: at,
      });
      context.notify(
        "lab",
        t.patient,
        "Sample received from Nurse Williams",
        people[t.patient].name + " · fictional CBC ready for processing.",
        "queue",
      );
    }
    context.notify(
      "doctor",
      t.patient,
      "Nursing task completed",
      people[t.patient].name + " · " + taskTypes[t.type].title,
      "requests",
    );
    context.notify(
      "patient",
      t.patient,
      "Nurse Williams updated your record",
      taskTypes[t.type].result,
      "timeline",
    );
  }
  context.recordEvent(
    t.patient,
    "Nursing task " + next.replaceAll("_", " "),
    taskTypes[t.type].title,
  );
  return next === "completed"
    ? "Filed. Doctor and patient demo views now show the update."
    : "Task " + next.replaceAll("_", " ") + ".";
}

export const nursingCommands = Object.freeze({
  "assign-task": assignTask,
  "advance-task": advanceTask,
});
