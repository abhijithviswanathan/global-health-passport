import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "../../apps/web/node_modules/typescript/lib/typescript.js";
import { createTypeScriptLoader } from "./load-typescript.mjs";
const load = createTypeScriptLoader(ts);
const care = await load(
  new URL("../../apps/shared/care-model.ts", import.meta.url),
);
const ecosystem = await load(
  new URL("../../apps/shared/ecosystem-model.ts", import.meta.url),
);

test("insurance editing keeps selected version and clears encrypted identity inputs", () => {
  const selected = {
    id: "fictional-policy",
    version: 4,
    company: "Example",
    plan_name: "Sample",
    coverage_order: "primary",
    memberId: "must-not-copy",
  };
  const actions = ecosystem.actions("patient", "Insurance", selected, {});
  assert.deepEqual(
    actions.map((a) => a.label),
    [
      "Add insurance",
      "Edit this insurance profile",
      "Share insurance with care organization",
    ],
  );
  const edit = actions[1];
  assert.deepEqual(edit.fixed, { id: selected.id, version: 4 });
  const values = care.initial(edit, "patient");
  assert.equal(values.plan, "Sample");
  assert.equal(values.memberId, "");
  assert.equal(values.policyholder, "");
  assert.equal(values.coverageOrder, "primary");
  assert.equal(care.initial(actions[0], "patient").company, "");
});

test("task forms reflect ownership, state and independent verification", () => {
  const task = {
    id: "task",
    status: "open",
    version: 3,
    assignee_id: "nurse",
    creator_id: "doctor",
  };
  assert.equal(
    care
      .actions("nurse", "", { task, userId: "someone-else" })
      .some((a) => a.id === "taskstatus"),
    false,
  );
  const accept = care
    .actions("nurse", "", { task, userId: "nurse" })
    .find((a) => a.id === "taskstatus");
  assert.deepEqual(accept.fixed, { version: 3 });
  assert.deepEqual(accept.fields[0].options, [
    "accepted",
    "cancelled",
    "escalated",
  ]);
  const completed = { ...task, status: "completed" };
  assert.equal(
    care
      .actions("doctor", "", { task: completed, userId: "doctor" })
      .some((a) => a.id === "verifytask"),
    true,
  );
  assert.equal(
    care
      .actions("nurse", "", { task: completed, userId: "nurse" })
      .some((a) => a.id === "verifytask"),
    false,
  );
});

test("payload conversion keeps caller retry keys and excludes empty optional values", () => {
  const action = care
    .actions("nurse", "Tasks", {})
    .find((a) => a.id === "task");
  const values = {
    ...care.initial(action, "patient-a"),
    title: "Synthetic task",
    assigneeId: "",
    team: "Nursing",
  };
  const before = structuredClone(values);
  const first = care.payload(action, values, "same-attempt");
  assert.deepEqual(care.payload(action, values, "same-attempt"), first);
  assert.equal(first.requestKey, "same-attempt");
  assert.equal(first.patientId, "patient-a");
  assert.equal(Object.hasOwn(first, "assigneeId"), false);
  assert.deepEqual(values, before);
  assert.equal(care.initial(action, "patient-b").patientId, "patient-b");
});

test("record forms expose type-specific fields without reusing another invocation", () => {
  const action = care
    .actions("doctor", "Patients", {})
    .find((a) => a.id === "record");
  assert.ok(action);
  const prescription = care
    .visibleFields(action, { kind: "prescription" }, "doctor")
    .map((f) => f.key);
  const vitals = care
    .visibleFields(action, { kind: "vital" }, "nurse")
    .map((f) => f.key);
  assert.ok(prescription.includes("dosage"));
  assert.equal(vitals.includes("dosage"), false);
  assert.ok(vitals.some((key) => key.startsWith("vital_")));
  action.fields.find((f) => f.key === "title").label = "Changed only here";
  assert.notEqual(
    care
      .actions("doctor", "Patients", {})
      .find((a) => a.id === "record")
      .fields.find((f) => f.key === "title").label,
    "Changed only here",
  );
});
