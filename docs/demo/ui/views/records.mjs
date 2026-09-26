/** Pure records rendering: consumes a snapshot and returns HTML. */
import {
  reportTable,
  escape,
  date,
  icon,
  button,
  badge,
  empty,
  heading,
  personLine,
} from "../components.mjs";
import { people, scopes, sampleReport } from "../../data.mjs";
import { grantFor, hasScope, auditFor } from "../../store.mjs";

export function grantPrompt(context, scope) {
  const { state, patient } = context;
  const active = grantFor(state, patient),
    pending = state.requests.some(
      (r) => r.patient === patient && r.status === "pending",
    );
  return `<section class="panel lock-panel">${icon("lock")}<h2>${active ? "This information has not been shared" : "Let the patient decide what to share"}</h2><p>${active ? `The current grant does not include ${escape(scopes[scope]?.title || "this scope")}. The full guided story needs all three scopes. The patient can revoke and review a new request.` : `${people[patient].name} can approve specific information for a limited time, or decline.`}</p>${pending ? badge("pending") + "<p>The request is waiting in the patient’s Requests & sharing screen.</p>" : !active ? button("Request patient access", "request-access") : ""}${button("Explore patient response", "jump", 'data-role="patient" data-view="requests"', "secondary")}</section>`;
}

export function chart(context) {
  const { role, patient } = context;
  const p = people[patient];
  return `<section class="panel chart-summary"><div class="panelhead">${personLine(p)}<span class="pill">Fictional case sheet</span></div><p class="eyebrow">Reason for visit</p><h2>${p.story}</h2><p class="muted">${p.job} · ${p.room}</p><div class="callout warning"><strong>Allergies & reconciliation</strong><p>${p.allergy}</p></div>${vitals(context, p)}<div class="cards"><div class="record"><h3>Presenting illness & history</h3><p>${p.history}</p></div><div class="record"><h3>Consultation plan</h3><p>${p.plan}</p><h3>Previous consultation</h3><p>10 September 2026 · NorthStar Clinic. Fictional intake recorded; history requires clinician review. No confirmed diagnosis is asserted in this demo.</p></div></div><div class="buttonrow">${button(role === "patient" ? "Manage sharing" : "Coordinate care", "nav", 'data-view="requests"')}${button("Prescriptions", "nav", 'data-view="prescriptions"', "secondary")}${button("Reports", "nav", 'data-view="reports"', "secondary")}${button("Care timeline", "jump", 'data-role="patient" data-view="timeline"', "secondary")}</div></section>`;
}

export function vitals(context, p) {
  const { state } = context;
  const latest = state.observations.find((o) => o.patient === p.id),
    v = latest?.values || p.vitals;
  return `<div class="observations"><div class="panelhead"><h3>${latest ? "Latest nursing observations" : "Historical example observations"}</h3></div><div class="vitals"><div><strong>${v.temperature_c} °C</strong><small>Temperature</small></div><div><strong>${v.spo2_percent}%</strong><small>SpO₂</small></div><div><strong>${v.pulse_bpm} bpm</strong><small>Pulse</small></div><div><strong>${v.systolic_mmhg}/${v.diastolic_mmhg}</strong><small>BP · mmHg</small></div></div><small class="muted">${latest ? `Observed ${date(latest.observedAt)} · filed ${date(latest.recordedAt)} · ${latest.author}` : "Observed 10 September 2026, 08:00 Eastern · fictional intake. Historical values are not a new measurement."}</small></div>`;
}

export function reportsView(context) {
  const { state, role, patient } = context;
  if (role === "doctor" && !hasScope(state, patient, "records"))
    return (
      heading(
        "Reports, without the file hunt.",
        "See the specimen date, upload date and review state together.",
      ) + grantPrompt(context, "records")
    );
  const rows = state.reports.filter((r) => r.patient === patient);
  return (
    heading(
      role === "patient"
        ? "Your reports, in one place."
        : "Reports, without the file hunt.",
      "Observation time and entry time stay separate. A result is not automatically a diagnosis.",
    ) +
    (rows.length
      ? rows
          .map(
            (r) =>
              `<section class="panel report"><div class="panelhead"><div><p class="eyebrow">NorthStar Laboratory · ${r.id}</p><h2>${sampleReport.name}</h2></div>${badge(r.status)}</div><p>${people[patient].name} · ${sampleReport.specimen}</p><div class="report-dates"><p><strong>Specimen / observation time</strong><span>${date(r.observedAt)}</span></p><p><strong>Entered into record</strong><span>${date(r.createdAt)}</span></p></div>${reportTable()}<div class="callout"><strong>${r.status === "reviewed" ? "Reviewed by Dr Smith" : "Awaiting Dr Smith’s review"}</strong><p>Fictional numbers demonstrate a report layout. No reference ranges, diagnostic conclusions or treatment recommendations are inferred.</p></div>${role === "doctor" && r.status === "awaiting_review" ? button("Record my review", "review-report", `data-id="${r.id}"`) : ""}</section>`,
          )
          .join("")
      : empty(
          "No reports available yet",
          "The doctor can request sample collection, the nurse completes collection, and the laboratory releases a fictional report.",
        ))
  );
}

export function timelineView(context) {
  const { state, role, patient } = context;
  const rows = auditFor(state, patient),
    nurse = role === "nurse";
  const visible = nurse
    ? rows.filter(
        (e) =>
          e.title.startsWith("Nursing") || e.title.startsWith("Laboratory"),
      )
    : rows;
  return (
    heading(
      `${people[patient].name.split(" ")[0]}’s care timeline.`,
      nurse
        ? "Nursing and specimen handoff events for the focus patient."
        : "One story across requests, observations, prescriptions, reports and follow-up.",
    ) +
    (nurse && !hasScope(state, patient, "care")
      ? empty(
          "Sharing is needed",
          "This patient has not shared nursing coordination information.",
        )
      : `<section class="panel"><ol class="care-timeline">${visible.map((e) => `<li><span class="timeline-dot">${icon("check")}</span><div><small>${date(e.at)} · ${e.actor}</small><h3>${e.title}</h3><p>${e.detail}</p></div></li>`).join("")}${nurse ? "" : `<li><span class="timeline-dot">${icon("list")}</span><div><small>10 September 2026 · Fictional intake</small><h3>Health story created</h3><p>Historical intake, reported allergies and previous consultation added as presentation examples.</p></div></li>`}</ol>${nurse && !visible.length ? empty("No nursing activity yet", "Accept or complete a request to add its event here.") : ""}</section>`)
  );
}
