/**
 * Pure, in-memory workflow simulation shared by every demo perspective.
 * This is NOT authentication: all fixtures are public and role controls are a tour device.
 * Each transition checks its current state so repeat clicks cannot duplicate work.
 * Reloading creates fresh state; no API requests, cookies or browser storage are used.
 */
import {
  people,
  roles,
  scopes,
  taskTypes,
  medicine,
  demoStart,
} from "./data.mjs";

export function createState() {
  return {
    tick: 0,
    sequence: 20,
    requests: [
      {
        id: "access-noah",
        patient: 1,
        status: "pending",
        scope: ["records", "care"],
        requestedAt: demoStart - 600000,
      },
    ],
    grants: [2, 3].map((patient) => ({
      patient,
      scope: Object.keys(scopes),
      expiresAt: demoStart + 7 * 86400000,
    })),
    tasks: [
      {
        id: "task-fatima",
        patient: 2,
        type: "vitals",
        status: "accepted",
        priority: "Routine",
        due: "09:00",
        createdAt: demoStart - 1200000,
      },
      {
        id: "task-leo",
        patient: 3,
        type: "specimen",
        status: "requested",
        priority: "Routine",
        due: "09:30",
        createdAt: demoStart - 600000,
      },
    ],
    prescriptions: [
      {
        id: "rx-fatima",
        patient: 2,
        status: "ready",
        medicine: { ...medicine, name: "SampleMed B" },
        createdAt: demoStart - 86400000,
        read: true,
      },
    ],
    reports: [
      {
        id: "report-alice",
        patient: 0,
        kind: "cbc",
        status: "reviewed",
        observedAt: demoStart - 86400000,
        createdAt: demoStart - 3600000,
      },
    ],
    labs: [],
    observations: [],
    appointments: [],
    messages: [
      {
        id: "msg-fatima",
        patient: 2,
        from: "doctor",
        to: "patient",
        body: "Your demonstration prescription is ready at Harbor Pharmacy. Open Prescriptions to see the collection status.",
        createdAt: demoStart - 600000,
      },
    ],
    events: [],
    notifications: [
      {
        id: "notice-nurse",
        role: "nurse",
        patient: 3,
        title: "New request from Dr Smith",
        detail:
          "Collect the requested blood sample · Leo Fernandes · due 09:30.",
        view: "queue",
        read: false,
        at: demoStart - 600000,
      },
      {
        id: "notice-noah",
        role: "patient",
        patient: 1,
        title: "Dr Smith requested access",
        detail: "Review the history and nursing scopes before sharing.",
        view: "requests",
        read: false,
        at: demoStart - 600000,
      },
      {
        id: "notice-fatima",
        role: "patient",
        patient: 2,
        title: "Your sample prescription is ready",
        detail: "Harbor Pharmacy · SampleMed B · fictional example.",
        view: "prescriptions",
        read: false,
        at: demoStart - 600000,
      },
    ],
  };
}
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

function requireRole(role, ...allowed) {
  if (!allowed.includes(role))
    throw new Error("Switch to the relevant demo perspective for this action.");
}
function requireScope(state, patient, scope) {
  if (!hasScope(state, patient, scope))
    throw new Error(
      "The patient must approve this sharing scope first. Open Patient → Requests & sharing.",
    );
}
function find(rows, id) {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error("This example is no longer available.");
  return row;
}
function requireStatus(row, status) {
  if (row.status !== status)
    throw new Error(
      "This item has changed. Review its current status before continuing.",
    );
}
function validPatient(patient) {
  if (!people.some((p) => p.id === patient))
    throw new Error("Choose a fictional patient.");
}

/** All writes go through this function; notifications and timeline entries are created together. */
export function dispatch(state, role, action, input = {}) {
  const patient = input.patient;
  if (patient !== undefined) validPatient(patient);
  // Work on a copy: a rejected transition never leaves partial notifications or changed rows behind.
  const s = structuredClone(state);
  const at = demoStart + (s.tick + 1) * 60000;
  const id = (prefix) => prefix + "-" + ++s.sequence;
  const event = (p, title, detail = "") =>
    s.events.unshift({
      id: id("event"),
      patient: p,
      actor: role === "patient" ? people[p].name : roles[role].name,
      title,
      detail,
      at,
    });
  const notify = (target, p, title, detail, view) =>
    s.notifications.unshift({
      id: id("notice"),
      role: target,
      patient: p,
      title,
      detail,
      view,
      read: false,
      at,
    });
  let feedback = "Demo updated.";
  switch (action) {
    case "request-access": {
      requireRole(role, "doctor");
      if (grantFor(s, patient))
        throw new Error(
          "Sharing is already active. The patient can change it in Requests & sharing.",
        );
      if (
        s.requests.some((r) => r.patient === patient && r.status === "pending")
      )
        throw new Error(
          "An access request is already waiting for this patient.",
        );
      s.requests.unshift({
        id: id("access"),
        patient,
        status: "pending",
        scope: Object.keys(scopes),
        requestedAt: at,
      });
      notify(
        "patient",
        patient,
        "Dr Smith requested access",
        "Choose which information to share and for how long.",
        "requests",
      );
      event(
        patient,
        "Access requested",
        "Dr Smith requested history, nursing coordination and prescriptions.",
      );
      feedback = "Request delivered to the patient demo inbox.";
      break;
    }
    case "decide-access": {
      requireRole(role, "patient");
      const r = find(s.requests, input.id);
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
        s.grants = s.grants.filter((g) => g.patient !== patient);
        s.grants.push({
          patient,
          scope: chosen,
          expiresAt: at + input.days * 86400000,
        });
        event(
          patient,
          "Sharing approved",
          chosen.map((x) => scopes[x].title).join(", ") +
            ` · ${input.days} day(s).`,
        );
      } else
        event(
          patient,
          "Access request declined",
          "No additional information was shared.",
        );
      r.status = input.decision;
      notify(
        "doctor",
        patient,
        "Patient " + input.decision + " sharing",
        people[patient].name + " responded to your request.",
        "patients",
      );
      s.notifications
        .filter(
          (n) =>
            n.role === "patient" &&
            n.patient === patient &&
            n.view === "requests",
        )
        .forEach((n) => (n.read = true));
      feedback =
        input.decision === "approved"
          ? "Sharing approved. Switch to the doctor to continue."
          : "Request declined. The chart stays closed.";
      break;
    }
    case "revoke-access": {
      requireRole(role, "patient");
      if (!grantFor(s, patient))
        throw new Error("There is no active sharing to revoke.");
      s.grants = s.grants.filter((g) => g.patient !== patient);
      event(
        patient,
        "Sharing revoked",
        "Future chart, nursing and prescription actions in this demo require a new approval.",
      );
      notify(
        "doctor",
        patient,
        "Patient revoked sharing",
        people[patient].name + " ended the demonstration grant.",
        "patients",
      );
      feedback =
        "Sharing revoked. Existing historical entries remain in the patient record.";
      break;
    }
    case "assign-task": {
      requireRole(role, "doctor");
      requireScope(s, patient, "care");
      if (!taskTypes[input.type]) throw new Error("Choose a supported task.");
      if (
        s.tasks.some(
          (t) =>
            t.patient === patient &&
            t.type === input.type &&
            !["completed", "declined"].includes(t.status),
        )
      )
        throw new Error("This patient already has that task in progress.");
      s.tasks.unshift({
        id: id("task"),
        patient,
        type: input.type,
        status: "requested",
        priority: input.priority === "Urgent" ? "Urgent" : "Routine",
        due: "10:00",
        createdAt: at,
      });
      event(
        patient,
        "Nursing request sent",
        taskTypes[input.type].title + " · assigned to Nurse Williams.",
      );
      notify(
        "nurse",
        patient,
        "New request from Dr Smith",
        people[patient].name + " · " + taskTypes[input.type].title,
        "queue",
      );
      notify(
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
      feedback =
        "Request delivered to Nurse Williams. Open the nurse queue to accept it.";
      break;
    }
    case "advance-task": {
      requireRole(role, "nurse");
      const t = find(s.tasks, input.id);
      requireScope(s, t.patient, "care");
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
          s.observations.unshift({
            id: id("obs"),
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
          s.labs.unshift({
            id: id("lab"),
            patient: t.patient,
            status: "received",
            createdAt: at,
          });
          notify(
            "lab",
            t.patient,
            "Sample received from Nurse Williams",
            people[t.patient].name + " · fictional CBC ready for processing.",
            "queue",
          );
        }
        notify(
          "doctor",
          t.patient,
          "Nursing task completed",
          people[t.patient].name + " · " + taskTypes[t.type].title,
          "requests",
        );
        notify(
          "patient",
          t.patient,
          "Nurse Williams updated your record",
          taskTypes[t.type].result,
          "timeline",
        );
      }
      event(
        t.patient,
        "Nursing task " + next.replaceAll("_", " "),
        taskTypes[t.type].title,
      );
      feedback =
        next === "completed"
          ? "Filed. Doctor and patient demo views now show the update."
          : "Task " + next.replaceAll("_", " ") + ".";
      break;
    }
    case "issue-prescription": {
      requireRole(role, "doctor");
      requireScope(s, patient, "prescriptions");
      if (!input.reviewed)
        throw new Error(
          "Confirm review of the example patient and prescription.",
        );
      if (
        s.prescriptions.some(
          (r) => r.patient === patient && r.status !== "dispensed",
        )
      )
        throw new Error(
          "An active sample prescription already exists for this patient.",
        );
      s.prescriptions.unshift({
        id: id("rx"),
        patient,
        status: "sent",
        medicine: { ...medicine },
        createdAt: at,
        read: false,
      });
      event(
        patient,
        "Sample prescription issued",
        "DemoCare A · 10 mg · 5 example tablets · Harbor Pharmacy.",
      );
      notify(
        "patient",
        patient,
        "New prescription from Dr Smith",
        "Review the fictional directions and follow pharmacy progress.",
        "prescriptions",
      );
      notify(
        "pharmacy",
        patient,
        "Prescription received",
        people[patient].name + " · DemoCare A · review required.",
        "prescriptions",
      );
      feedback = "Prescription sent to the patient and pharmacy demo inboxes.";
      break;
    }
    case "ack-prescription": {
      requireRole(role, "patient");
      const rx = find(s.prescriptions, input.id);
      if (rx.patient !== patient)
        throw new Error("Choose your own example prescription.");
      if (rx.read)
        throw new Error("This prescription is already marked as seen.");
      rx.read = true;
      event(
        patient,
        "Prescription instructions viewed",
        rx.medicine.name + " · viewing is not a dose administration record.",
      );
      feedback =
        "Marked as seen. No dose or medication administration was recorded.";
      break;
    }
    case "advance-prescription": {
      requireRole(role, "pharmacy");
      const rx = find(s.prescriptions, input.id);
      requireScope(s, rx.patient, "prescriptions");
      const next = { sent: "reviewed", reviewed: "ready", ready: "dispensed" }[
        rx.status
      ];
      if (!next)
        throw new Error("This sample prescription has already been dispensed.");
      if (!input.confirmed)
        throw new Error("Confirm the sample patient and prescription checks.");
      rx.status = next;
      event(
        rx.patient,
        "Pharmacy: " + next,
        rx.medicine.name + " · Pharmacist Davis · Harbor Pharmacy.",
      );
      notify(
        "patient",
        rx.patient,
        next === "ready"
          ? "Your prescription is ready"
          : next === "dispensed"
            ? "Collection recorded"
            : "Pharmacist reviewed your prescription",
        rx.medicine.name + " · fictional demonstration only.",
        "prescriptions",
      );
      if (next === "dispensed")
        notify(
          "doctor",
          rx.patient,
          "Prescription dispensed",
          people[rx.patient].name + " · sample collection completed.",
          "prescriptions",
        );
      feedback = "Pharmacy status updated for the doctor and patient.";
      break;
    }
    case "advance-lab": {
      requireRole(role, "lab");
      const lab = find(s.labs, input.id);
      requireScope(s, lab.patient, "care");
      const next = { received: "processing", processing: "reported" }[
        lab.status
      ];
      if (!next) throw new Error("This sample already has a report.");
      if (next === "reported" && !input.confirmed)
        throw new Error("Review the fictional report before releasing it.");
      lab.status = next;
      if (next === "reported") {
        s.reports.unshift({
          id: id("report"),
          patient: lab.patient,
          kind: "cbc",
          status: "awaiting_review",
          observedAt: lab.createdAt,
          createdAt: at,
        });
        notify(
          "doctor",
          lab.patient,
          "New laboratory report to review",
          people[lab.patient].name + " · fictional CBC.",
          "reports",
        );
        notify(
          "patient",
          lab.patient,
          "Your sample report is available",
          "Awaiting Dr Smith’s review. No automated interpretation.",
          "reports",
        );
      }
      event(
        lab.patient,
        "Laboratory: " + next,
        "Technician Lee · fictional CBC.",
      );
      feedback = "Laboratory status updated across the demonstration.";
      break;
    }
    case "review-report": {
      requireRole(role, "doctor");
      const report = find(s.reports, input.id);
      requireScope(s, report.patient, "records");
      requireStatus(report, "awaiting_review");
      report.status = "reviewed";
      event(
        report.patient,
        "Report review recorded",
        "Dr Smith reviewed the fictional CBC.",
      );
      notify(
        "patient",
        report.patient,
        "Dr Smith reviewed your report",
        "Open the report to see the reviewer and dates.",
        "reports",
      );
      feedback = "Review recorded in the patient timeline.";
      break;
    }
    case "invite-followup": {
      requireRole(role, "doctor");
      requireScope(s, patient, "care");
      if (
        s.appointments.some(
          (a) => a.patient === patient && a.status === "invited",
        )
      )
        throw new Error(
          "A follow-up invitation is already awaiting a response.",
        );
      const time = input.time || "10:30";
      if (!["10:30", "14:00"].includes(time))
        throw new Error("Choose one of the example appointment times.");
      if (
        s.appointments.some(
          (a) => a.time === time && ["invited", "confirmed"].includes(a.status),
        )
      )
        throw new Error(
          "That example time already has a pending or confirmed visit. Choose the other time.",
        );
      s.appointments.unshift({
        id: id("appointment"),
        patient,
        status: "invited",
        date: "18 September 2026",
        time,
        place: "NorthStar Clinic · Room 2",
        createdAt: at,
      });
      event(
        patient,
        "Follow-up invitation sent",
        `18 September · ${time} Eastern · awaiting patient confirmation.`,
      );
      notify(
        "patient",
        patient,
        "Dr Smith invited you to a follow-up",
        "Confirm the example appointment or ask for another time.",
        "appointments",
      );
      feedback = "Follow-up invitation delivered to the patient.";
      break;
    }
    case "reply-followup": {
      requireRole(role, "patient");
      const a = find(s.appointments, input.id);
      if (a.patient !== patient)
        throw new Error("Choose your own example invitation.");
      requireStatus(a, "invited");
      if (!["confirmed", "reschedule_requested"].includes(input.status))
        throw new Error("Choose a valid response.");
      a.status = input.status;
      event(
        patient,
        input.status === "confirmed"
          ? "Follow-up confirmed"
          : "Another time requested",
        a.date + " · " + a.time + " Eastern.",
      );
      notify(
        "doctor",
        patient,
        input.status === "confirmed"
          ? "Follow-up confirmed"
          : "Patient requested another time",
        people[patient].name + " responded.",
        "appointments",
      );
      feedback = "Your response is visible in the doctor’s schedule.";
      break;
    }
    case "send-message": {
      requireRole(role, "patient", "doctor");
      if (role === "doctor") requireScope(s, patient, "care");
      const body =
        role === "patient"
          ? "I have a question about my sample prescription. Can we discuss it at my follow-up?"
          : "Thank you. I have seen your demonstration message and will discuss your questions at the follow-up.";
      const to = role === "patient" ? "doctor" : "patient";
      s.messages.push({
        id: id("message"),
        patient,
        from: role,
        to,
        body,
        createdAt: at,
      });
      notify(
        to,
        patient,
        "New message from " +
          (role === "patient" ? people[patient].name : "Dr Smith"),
        body,
        "messages",
      );
      event(
        patient,
        "Care message sent",
        "A demonstration message was added; it does not change treatment or complete a clinical task.",
      );
      feedback = "Example message delivered to the other perspective.";
      break;
    }
    case "read-notice": {
      requireRole(role, ...Object.keys(roles));
      const n = find(s.notifications, input.id);
      if (n.role !== role || (role === "patient" && n.patient !== patient))
        throw new Error("This notification belongs to another perspective.");
      n.read = true;
      feedback = "Notification opened.";
      break;
    }
    case "read-notices": {
      requireRole(role, ...Object.keys(roles));
      s.notifications
        .filter(
          (n) =>
            n.role === role && (role !== "patient" || n.patient === patient),
        )
        .forEach((n) => (n.read = true));
      feedback = "Demo notifications marked as read.";
      break;
    }
    default:
      throw new Error("Unknown demo action.");
  }
  s.tick++;
  return { state: s, feedback };
}

/** Guide progress is derived from the actual shared state, not from visiting a page. */
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
