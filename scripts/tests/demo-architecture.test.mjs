import assert from "node:assert/strict";
import { test } from "node:test";
import { DemoModel } from "../../docs/demo/model.mjs";
import { DemoNavigation } from "../../docs/demo/ui/navigation.mjs";
import { WorkflowEngine } from "../../docs/demo/workflow/engine.mjs";
import { createState } from "../../docs/demo/store.mjs";

test("model snapshots and reset cannot leak changes between demo tabs", () => {
  const first = new DemoModel();
  const second = new DemoModel();
  const initial = first.snapshot();
  const displayed = first.snapshot();
  displayed.tick = 999;
  assert.deepEqual(first.snapshot(), initial);
  first.execute("doctor", "request-access", { patient: 0 });
  assert.notDeepEqual(first.snapshot(), initial);
  assert.deepEqual(second.snapshot(), initial);
  first.reset();
  assert.deepEqual(first.snapshot(), initial);
});

test("a command that throws cannot publish partial state or advance the clock", () => {
  const engine = new WorkflowEngine({
    fail(transaction) {
      transaction.state.tick = 100;
      transaction.state.events.unshift({
        title: "Must never escape the failed command",
      });
      throw new Error("Review required");
    },
  });
  const model = new DemoModel(engine);
  const before = model.snapshot();
  assert.throws(
    () => model.execute("doctor", "fail", { patient: 0 }),
    /Review required/,
  );
  assert.deepEqual(model.snapshot(), before);
  assert.throws(
    () => engine.execute(createState(), "doctor", "unknown"),
    /Unknown/,
  );
});

test("navigation snapshots, history and validation are isolated from workflow state", () => {
  const navigation = new DemoNavigation();
  const home = navigation.snapshot();
  navigation.go("patient", "requests", 1);
  const snapshot = navigation.snapshot();
  snapshot.trail[0].patient = 3;
  assert.equal(navigation.snapshot().trail[0].patient, 0);
  assert.throws(
    () => navigation.go("doctor", "missing"),
    /available demo page/,
  );
  assert.throws(() => navigation.selectPatient(99), /fictional patient/);
  assert.equal(navigation.snapshot().patient, 1);
  navigation.back();
  assert.deepEqual(navigation.snapshot(), home);
  navigation.showTour(true);
  navigation.reset();
  assert.deepEqual(navigation.snapshot(), home);
});
