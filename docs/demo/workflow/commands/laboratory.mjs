/** Laboratory commands change one draft transaction and return user feedback. */
import { people } from "../../data.mjs";
import { requireRole, requireScope, find, requireStatus } from "../guards.mjs";

function advanceLab(context, input) {
  const { state, role, at } = context;
  requireRole(role, "lab");
  const lab = find(state.labs, input.id);
  requireScope(state, lab.patient, "care");
  const next = { received: "processing", processing: "reported" }[lab.status];
  if (!next) throw new Error("This sample already has a report.");
  if (next === "reported" && !input.confirmed)
    throw new Error("Review the fictional report before releasing it.");
  lab.status = next;
  if (next === "reported") {
    state.reports.unshift({
      id: context.nextId("report"),
      patient: lab.patient,
      kind: "cbc",
      status: "awaiting_review",
      observedAt: lab.createdAt,
      createdAt: at,
    });
    context.notify(
      "doctor",
      lab.patient,
      "New laboratory report to review",
      people[lab.patient].name + " · fictional CBC.",
      "reports",
    );
    context.notify(
      "patient",
      lab.patient,
      "Your sample report is available",
      "Awaiting Dr Smith’s review. No automated interpretation.",
      "reports",
    );
  }
  context.recordEvent(
    lab.patient,
    "Laboratory: " + next,
    "Technician Lee · fictional CBC.",
  );
  return "Laboratory status updated across the demonstration.";
}

function reviewReport(context, input) {
  const { state, role } = context;
  requireRole(role, "doctor");
  const report = find(state.reports, input.id);
  requireScope(state, report.patient, "records");
  requireStatus(report, "awaiting_review");
  report.status = "reviewed";
  context.recordEvent(
    report.patient,
    "Report review recorded",
    "Dr Smith reviewed the fictional CBC.",
  );
  context.notify(
    "patient",
    report.patient,
    "Dr Smith reviewed your report",
    "Open the report to see the reviewer and dates.",
    "reports",
  );
  return "Review recorded in the patient timeline.";
}

export const laboratoryCommands = Object.freeze({
  "advance-lab": advanceLab,
  "review-report": reviewReport,
});
