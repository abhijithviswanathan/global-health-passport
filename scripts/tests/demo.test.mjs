/** Public-demo regression tests; no API, credentials, network or browser storage. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  createState,
  dispatch,
  hasScope,
  grantFor,
  unread,
  tourSteps,
} from "../../docs/demo/store.mjs";

function session() {
  let state = createState();
  return {
    get state() {
      return state;
    },
    act(role, action, input = {}) {
      state = dispatch(state, role, action, input).state;
      return state;
    },
    approve(patient = 0, scopes = ["records", "care", "prescriptions"]) {
      this.act("doctor", "request-access", { patient });
      const request = state.requests.find(
        (r) => r.patient === patient && r.status === "pending",
      );
      this.act("patient", "decide-access", {
        patient,
        id: request.id,
        decision: "approved",
        scopes,
        days: 7,
      });
    },
  };
}
const latest = (s, collection, patient = 0) =>
  s.state[collection].find((r) => r.patient === patient);

test("Doctor request reaches only its patient; selected scopes and expiry are preserved", () => {
  const s = session();
  s.approve(0, ["care"]);
  assert.ok(hasScope(s.state, 0, "care"));
  assert.ok(!hasScope(s.state, 0, "records"));
  assert.ok(!hasScope(s.state, 0, "prescriptions"));
  assert.ok(unread(s.state, "doctor", 0) > 0);
  assert.equal(latest(s, "requests").status, "approved");
  const expired = structuredClone(s.state);
  expired.tick = 8 * 24 * 60;
  assert.equal(grantFor(expired, 0), undefined);
});

test("Decline, wrong patient, empty scope and duplicate request cannot silently share data", () => {
  const s = session();
  s.act("doctor", "request-access", { patient: 0 });
  const r = latest(s, "requests");
  const before = structuredClone(s.state);
  for (const input of [
    { patient: 1, id: r.id, decision: "approved", scopes: ["care"], days: 7 },
    { patient: 0, id: r.id, decision: "approved", scopes: [], days: 7 },
  ])
    assert.throws(() => s.act("patient", "decide-access", input));
  assert.throws(() => s.act("doctor", "request-access", { patient: 0 }));
  assert.deepEqual(s.state, before);
  s.act("patient", "decide-access", {
    patient: 0,
    id: r.id,
    decision: "declined",
  });
  assert.equal(grantFor(s.state, 0), undefined);
  s.act("doctor", "request-access", { patient: 0 });
  assert.equal(latest(s, "requests").status, "pending");
});

test("Nursing request arrives, requires acceptance and review, then creates a linked observation", () => {
  const s = session();
  s.approve();
  s.act("doctor", "assign-task", {
    patient: 0,
    type: "vitals",
    priority: "Urgent",
  });
  const task = latest(s, "tasks");
  assert.equal(task.status, "requested");
  assert.equal(task.priority, "Urgent");
  assert.ok(
    s.state.notifications.some(
      (n) => n.role === "nurse" && n.patient === 0 && n.view === "queue",
    ),
  );
  assert.throws(() =>
    s.act("doctor", "assign-task", { patient: 0, type: "vitals" }),
  );
  assert.throws(() => s.act("doctor", "advance-task", { id: task.id }));
  s.act("nurse", "advance-task", { id: task.id });
  s.act("nurse", "advance-task", { id: task.id });
  const before = structuredClone(s.state);
  assert.throws(() => s.act("nurse", "advance-task", { id: task.id }));
  assert.deepEqual(s.state, before);
  s.act("nurse", "advance-task", { id: task.id, confirmed: true });
  const obs = latest(s, "observations");
  assert.ok(obs.observedAt < obs.recordedAt);
  assert.equal(obs.values.spo2_percent, 98);
  assert.ok(
    s.state.notifications.some(
      (n) =>
        n.role === "doctor" &&
        n.patient === 0 &&
        n.title === "Nursing task completed",
    ),
  );
  assert.ok(
    s.state.notifications.some(
      (n) => n.role === "patient" && n.patient === 0 && n.view === "timeline",
    ),
  );
  assert.throws(() =>
    s.act("nurse", "advance-task", { id: task.id, confirmed: true }),
  );
  assert.equal(s.state.observations.length, 1);
});

test("Prescription carries directions through patient acknowledgment and all pharmacy states", () => {
  const s = session();
  s.approve();
  assert.throws(() => s.act("doctor", "issue-prescription", { patient: 0 }));
  s.act("doctor", "issue-prescription", { patient: 0, reviewed: true });
  const rx = latest(s, "prescriptions");
  assert.equal(rx.medicine.name, "DemoCare A");
  assert.equal(rx.medicine.quantity, 5);
  assert.throws(() =>
    s.act("patient", "ack-prescription", { patient: 1, id: rx.id }),
  );
  s.act("patient", "ack-prescription", { patient: 0, id: rx.id });
  assert.equal(latest(s, "prescriptions").status, "sent");
  assert.throws(() => s.act("pharmacy", "advance-prescription", { id: rx.id }));
  for (const expected of ["reviewed", "ready", "dispensed"]) {
    s.act("pharmacy", "advance-prescription", { id: rx.id, confirmed: true });
    assert.equal(latest(s, "prescriptions").status, expected);
  }
  assert.ok(
    s.state.notifications.some(
      (n) => n.role === "patient" && n.title === "Your prescription is ready",
    ),
  );
  assert.ok(
    s.state.notifications.some(
      (n) => n.role === "doctor" && n.title === "Prescription dispensed",
    ),
  );
  assert.throws(() =>
    s.act("pharmacy", "advance-prescription", { id: rx.id, confirmed: true }),
  );
});

test("Revocation blocks future staff actions while patient historical records remain", () => {
  const s = session();
  s.approve();
  s.act("doctor", "assign-task", { patient: 0, type: "vitals" });
  const t = latest(s, "tasks");
  s.act("doctor", "issue-prescription", { patient: 0, reviewed: true });
  const rx = latest(s, "prescriptions");
  s.act("patient", "revoke-access", { patient: 0 });
  const before = structuredClone(s.state);
  for (const [role, action, input] of [
    ["doctor", "assign-task", { patient: 0, type: "specimen" }],
    ["nurse", "advance-task", { id: t.id }],
    ["pharmacy", "advance-prescription", { id: rx.id, confirmed: true }],
    ["doctor", "invite-followup", { patient: 0 }],
    ["doctor", "send-message", { patient: 0 }],
  ])
    assert.throws(() => s.act(role, action, input));
  assert.deepEqual(s.state, before);
  assert.ok(latest(s, "prescriptions"));
  assert.ok(latest(s, "reports"));
  s.act("patient", "ack-prescription", { patient: 0, id: rx.id });
  assert.equal(latest(s, "prescriptions").read, true);
});

test("Specimen collection, lab release and doctor review are separate traceable steps", () => {
  const s = session();
  s.approve();
  s.act("doctor", "assign-task", { patient: 0, type: "specimen" });
  const t = latest(s, "tasks");
  for (let i = 0; i < 3; i++)
    s.act("nurse", "advance-task", { id: t.id, confirmed: true });
  const lab = latest(s, "labs");
  assert.equal(lab.status, "received");
  assert.equal(s.state.reports.length, 1);
  s.act("lab", "advance-lab", { id: lab.id });
  assert.throws(() => s.act("lab", "advance-lab", { id: lab.id }));
  s.act("lab", "advance-lab", { id: lab.id, confirmed: true });
  const report = latest(s, "reports");
  assert.equal(report.status, "awaiting_review");
  assert.ok(report.observedAt < report.createdAt);
  s.act("doctor", "review-report", { id: report.id });
  assert.equal(latest(s, "reports").status, "reviewed");
  assert.throws(() => s.act("doctor", "review-report", { id: report.id }));
});

test("Follow-up is pending until its patient confirms or asks for a different time", () => {
  const s = session();
  s.approve();
  s.act("doctor", "invite-followup", { patient: 0 });
  const a = latest(s, "appointments");
  assert.throws(() => s.act("doctor", "invite-followup", { patient: 0 }));
  assert.throws(() =>
    s.act("patient", "reply-followup", {
      patient: 1,
      id: a.id,
      status: "confirmed",
    }),
  );
  s.act("patient", "reply-followup", {
    patient: 0,
    id: a.id,
    status: "reschedule_requested",
  });
  assert.equal(latest(s, "appointments").status, "reschedule_requested");
  s.act("doctor", "invite-followup", { patient: 0, time: "14:00" });
  const replacement = latest(s, "appointments");
  assert.equal(replacement.time, "14:00");
  s.act("patient", "reply-followup", {
    patient: 0,
    id: replacement.id,
    status: "confirmed",
  });
  assert.equal(latest(s, "appointments").status, "confirmed");
});

test("Canned messages cross perspectives and reading notices cannot read another patient’s inbox", () => {
  const s = session();
  s.approve();
  s.act("patient", "send-message", { patient: 0 });
  assert.ok(s.state.messages.some((m) => m.patient === 0 && m.to === "doctor"));
  s.act("doctor", "send-message", { patient: 0 });
  assert.ok(
    s.state.messages.some((m) => m.patient === 0 && m.to === "patient"),
  );
  const noah = unread(s.state, "patient", 1);
  s.act("patient", "read-notices", { patient: 0 });
  assert.equal(unread(s.state, "patient", 0), 0);
  assert.equal(unread(s.state, "patient", 1), noah);
});

test("Guided journey completes only through all nine workflow outcomes; reset is isolated", () => {
  const s = session();
  assert.equal(tourSteps(s.state).filter((s) => s.done).length, 0);
  s.approve();
  s.act("doctor", "assign-task", { patient: 0, type: "vitals" });
  const t = latest(s, "tasks");
  for (let i = 0; i < 3; i++)
    s.act("nurse", "advance-task", { id: t.id, confirmed: true });
  s.act("doctor", "issue-prescription", { patient: 0, reviewed: true });
  const rx = latest(s, "prescriptions");
  s.act("patient", "ack-prescription", { patient: 0, id: rx.id });
  for (let i = 0; i < 3; i++)
    s.act("pharmacy", "advance-prescription", { id: rx.id, confirmed: true });
  s.act("doctor", "invite-followup", { patient: 0 });
  const a = latest(s, "appointments");
  assert.equal(tourSteps(s.state).filter((s) => s.done).length, 8);
  s.act("patient", "reply-followup", {
    patient: 0,
    id: a.id,
    status: "confirmed",
  });
  assert.equal(tourSteps(s.state).filter((s) => s.done).length, 9);
  const fresh = createState();
  assert.equal(tourSteps(fresh).filter((s) => s.done).length, 0);
  assert.equal(fresh.observations.length, 0);
  fresh.prescriptions[0].medicine.name = "changed";
  assert.equal(createState().prescriptions[0].medicine.name, "SampleMed B");
});

test("Pending or confirmed follow-up slots cannot be double-booked", () => {
  const s = session();
  s.approve();
  s.act("doctor", "invite-followup", { patient: 0, time: "10:30" });
  assert.throws(() =>
    s.act("doctor", "invite-followup", { patient: 2, time: "10:30" }),
  );
  const a = latest(s, "appointments");
  s.act("patient", "reply-followup", {
    patient: 0,
    id: a.id,
    status: "confirmed",
  });
  assert.throws(() =>
    s.act("doctor", "invite-followup", { patient: 2, time: "10:30" }),
  );
  s.act("doctor", "invite-followup", { patient: 2, time: "14:00" });
  assert.equal(latest(s, "appointments", 2).time, "14:00");
});

test("Timeline attributes patient actions to the selected fictional person", () => {
  const s = session();
  s.act("patient", "decide-access", {
    patient: 1,
    id: "access-noah",
    decision: "approved",
    scopes: ["records", "care"],
    days: 7,
  });
  assert.equal(s.state.events[0].actor, "Noah Bennett");
  s.act("patient", "revoke-access", { patient: 2 });
  assert.equal(s.state.events[0].actor, "Fatima Rahman");
  s.act("doctor", "send-message", { patient: 1 });
  assert.equal(s.state.events[0].actor, "Dr Smith");
});
