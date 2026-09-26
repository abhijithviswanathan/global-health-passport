/** Pure nursing rendering: consumes a snapshot and returns HTML. */
import {
  stats,
  date,
  label,
  button,
  badge,
  empty,
  heading,
  personLine,
} from "../components.mjs";
import { people, taskTypes, sampleReport } from "../../data.mjs";
import { hasScope, unread } from "../../store.mjs";

export function tasksList(context, rows, actionable) {
  const { state, patient } = context;
  if (!rows.length)
    return empty(
      "No nursing requests yet",
      "Send a request from the doctor view, then open the nurse queue.",
    );
  return `<div class="work-cards">${rows
    .map((t) => {
      const tdef = taskTypes[t.type],
        allowed = hasScope(state, t.patient, "care");
      return `<article class="panel work-card ${t.patient === patient ? "focused" : ""}"><div class="panelhead">${personLine(people[t.patient])}${badge(t.status)}</div><div class="work-meta"><span>${t.priority} priority</span><span>Due ${t.due} Eastern</span><span>From Dr Smith</span></div><h2>${tdef.title}</h2><p>${tdef.detail}</p><div class="task-progress">${["requested", "accepted", "in_progress", "completed"].map((v, i) => `<span class="${i <= ["requested", "accepted", "in_progress", "completed"].indexOf(t.status) ? "reached" : ""}">${i + 1}. ${label(v)}</span>`).join("")}</div>${t.status === "completed" ? `<div class="callout"><strong>Filed ${date(t.completedAt)}</strong><p>${tdef.result}</p></div>` : actionable ? (allowed ? button(t.status === "requested" ? "Accept request" : t.status === "accepted" ? "Start task" : "Review & file result", "task-advance", `data-id="${t.id}"`) : '<p class="callout warning">Patient sharing ended. Ask the doctor to request renewed consent before continuing.</p>') : button("Show nurse’s queue", "jump", `data-role="nurse" data-view="queue" data-patient="${t.patient}"`, "secondary")}</article>`;
    })
    .join("")}</div>`;
}

export function nurseView(context) {
  const { state, patient } = context;
  const rows = [...state.tasks].sort(
    (a, b) => (b.patient === patient) - (a.patient === patient),
  );
  return (
    heading(
      "Your next step is clear.",
      "Requests arrive with the patient, requester, due time and exactly what needs doing.",
    ) +
    stats([
      [
        rows.filter((t) => t.status === "requested").length,
        "New requests",
        "bell",
      ],
      [
        rows.filter((t) => ["accepted", "in_progress"].includes(t.status))
          .length,
        "Accepted / in progress",
        "clock",
      ],
      [
        rows.filter((t) => t.status === "completed").length,
        "Completed",
        "check",
      ],
      [unread(state, "nurse", patient), "Inbox updates", "mail"],
    ]) +
    tasksList(context, rows, true)
  );
}

export function labView(context) {
  const { state } = context;
  return (
    heading(
      "Samples in. Clear updates out.",
      "The nurse’s collection task hands the example to the lab; releasing the report alerts doctor and patient.",
    ) +
    (state.labs.length
      ? `<div class="work-cards">${state.labs.map((l) => `<section class="panel"><div class="panelhead">${personLine(people[l.patient])}${badge(l.status)}</div><h2>Complete blood count</h2><p>Requested by Dr Smith · collected by Nurse Williams</p><p class="muted">${sampleReport.specimen} · received ${date(l.createdAt)}</p><div class="callout"><strong>Keep the handoff visible</strong><p>Received → Processing → Report released → Doctor review. Collection and report review are separate steps.</p></div>${l.status === "reported" ? '<p class="badge green">Report released to doctor and patient</p>' : hasScope(state, l.patient, "care") ? button(l.status === "received" ? "Start processing" : "Review & release sample report", "lab-advance", `data-id="${l.id}"`) : '<p class="callout warning">Patient sharing ended. Renew care sharing before continuing.</p>'}</section>`).join("")}</div>`
      : empty(
          "Waiting for a collected sample",
          "Switch to the nurse and complete a sample-collection request. It will arrive here automatically.",
        ))
  );
}
