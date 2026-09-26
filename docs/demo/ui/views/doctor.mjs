/** Pure doctor rendering: consumes a snapshot and returns HTML. */
import { stats, icon, button, heading, personLine } from "../components.mjs";
import { tasksList } from "./nursing.mjs";
import { grantPrompt, chart } from "./records.mjs";
import { people, taskTypes } from "../../data.mjs";
import { grantFor, hasScope, unread } from "../../store.mjs";

export function doctorHome(context) {
  const { state, role, patient } = context;
  return (
    heading(
      "A clearer day, Dr Smith.",
      "Your patients, incoming work and follow-ups — connected in one place.",
    ) +
    `<section class="hero"><div><p class="eyebrow">NorthStar Clinic · Friday</p><h2>Less chasing.<br>More time for care.</h2><p>Ask the patient once, delegate to the right teammate and watch results return to the same care story.</p>${button("Open Alice’s chart " + icon("arrow"), "open-patient", 'data-patient="0"')}</div><div class="hero-art"><div class="orbit">${icon("heart")}<div class="mini"><strong>5</strong>connected perspectives</div></div></div></section>` +
    stats([
      [4, "Morning visits", "people"],
      [
        state.tasks.filter((t) => t.status !== "completed").length,
        "Nursing tasks open",
        "list",
      ],
      [
        state.reports.filter(
          (r) =>
            r.status === "awaiting_review" &&
            hasScope(state, r.patient, "records"),
        ).length,
        "Reports to review",
        "list",
      ],
      [unread(state, "doctor", patient), "New updates", "bell"],
    ]) +
    `<div class="columns"><section class="panel"><div class="panelhead"><div><h2>Your morning, at a glance</h2><p>11 September · Eastern · 30-minute appointments</p></div>${button("Schedule", "nav", 'data-view="appointments"', "secondary")}</div>${agenda(context)}</section><section class="panel"><div class="panelhead"><h2>Where attention is needed</h2></div><div class="action-stack">${button("Review patient sharing " + icon("arrow"), "nav", 'data-view="patients"', "secondary")}${button("Send a nursing request " + icon("arrow"), "nav", 'data-view="requests"', "secondary")}${button("Review reports " + icon("arrow"), "nav", 'data-view="reports"', "secondary")}${button(`Open inbox (${unread(state, role, patient)})`, "nav", 'data-view="inbox"', "secondary")}</div><div class="callout"><strong>One update, several people informed.</strong><p>When the nurse files observations, the doctor sees completion and the patient gets a timeline update. Nobody needs to copy the same note into a second screen.</p></div></section></div>`
  );
}

export function agenda(context) {
  const { state } = context;
  return `<div class="agenda">${people.map((p) => `<div class="agenda-row"><time>${p.time}</time><button class="agenda-event" data-action="open-patient" data-patient="${p.id}"><strong>${p.name}</strong><span>${p.room} · 30 min</span><small>${grantFor(state, p.id) ? "Sharing active" : "Sharing needed before opening chart"}</small></button></div>`).join("")}<div class="agenda-row"><time>10:00</time><div class="agenda-gap">Care coordination & report review · 30 min</div></div></div>`;
}

export function patientsView(context) {
  const { state, patient } = context;
  return (
    heading(
      "Patients, with context.",
      "Choose a patient to prepare the visit, review their story and coordinate the next step.",
    ) +
    `<div class="patient-tabs">${people.map((p) => `<button data-action="select-patient" data-patient="${p.id}" class="patient-tab ${patient === p.id ? "selected" : ""}" aria-pressed="${patient === p.id}">${personLine(p)}<span class="badge ${grantFor(state, p.id) ? "green" : "gray"}">${grantFor(state, p.id) ? "Sharing active" : "Sharing needed"}</span></button>`).join("")}</div>` +
    (hasScope(state, patient, "records")
      ? chart(context)
      : grantPrompt(context, "records"))
  );
}

export function doctorRequests(context) {
  const { state, patient } = context;
  return (
    heading(
      "Delegate once. Stay in the loop.",
      "Nurse Williams receives the request in her queue and inbox. Completion comes back here.",
    ) +
    (hasScope(state, patient, "care")
      ? `<section class="panel"><div class="panelhead">${personLine(people[patient])}<span class="pill">Assigned nurse · Williams</span></div><div class="request-options">${Object.entries(
          taskTypes,
        )
          .map(
            ([type, t]) =>
              `<div class="request-option"><span class="symbol">${icon(type === "vitals" ? "heart" : type === "specimen" ? "list" : "clock")}</span><h3>${t.title}</h3><p>${t.detail}</p>${button("Create request", "task-dialog", `data-type="${type}" aria-label="Create ${type} request"`)}</div>`,
          )
          .join(
            "",
          )}</div></section><h2 class="section-title">Requests for ${people[patient].name}</h2>${tasksList(
          context,
          state.tasks.filter((t) => t.patient === patient),
          false,
        )}`
      : grantPrompt(context, "care"))
  );
}
